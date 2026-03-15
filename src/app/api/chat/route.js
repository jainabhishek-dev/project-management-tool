import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import * as tools from '@/lib/ai/tools';

// Initialize the Gemini client
const client = new GoogleGenAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY);

// Define tools for the model
const toolDefinitions = [
  {
    functionDeclarations: [
      {
        name: 'list_all_projects',
        description: 'Lists all projects in the database, including their academic years.',
        parameters: { type: 'object', properties: {} }
      },
      {
        name: 'get_project_details',
        description: 'Gets detailed information for a specific project by name.',
        parameters: {
          type: 'object',
          properties: {
            projectName: { type: 'string', description: 'The name of the project to look up.' }
          },
          required: ['projectName']
        }
      },
      {
        name: 'get_budgets_for_project',
        description: 'Lists all budget versions across all stages for a specific project.',
        parameters: {
          type: 'object',
          properties: {
            projectName: { type: 'string', description: 'The name of the project.' }
          },
          required: ['projectName']
        }
      },
      {
        name: 'get_budget_breakdown_by_role',
        description: 'Gets the financial breakdown (costs) grouped by professional roles for a specific budget ID.',
        parameters: {
          type: 'object',
          properties: {
            budgetId: { type: 'string', description: 'The unique UUID of the budget.' }
          },
          required: ['budgetId']
        }
      },
      {
        name: 'get_budget_breakdown_by_section',
        description: 'Gets the financial breakdown (subtotals) grouped by operational sections for a specific budget ID.',
        parameters: {
          type: 'object',
          properties: {
            budgetId: { type: 'string', description: 'The unique UUID of the budget.' }
          },
          required: ['budgetId']
        }
      },
      {
        name: 'find_costliest_line_items',
        description: 'Finds the top 5 most expensive individual tasks/line items in a specific budget ID.',
        parameters: {
          type: 'object',
          properties: {
            budgetId: { type: 'string', description: 'The unique UUID of the budget.' },
            limit: { type: 'integer', description: 'Number of items to return (default 5).' }
          },
          required: ['budgetId']
        }
      },
      {
        name: 'get_org_summary_stats',
        description: 'Gets high-level organization-wide budget statistics across all projects.',
        parameters: { type: 'object', properties: {} }
      },
      {
        name: 'search_budgets_by_status',
        description: 'Finds all budgets across the organization with a specific status (draft, submitted, approved, rejected).',
        parameters: {
          type: 'object',
          properties: {
            status: { type: 'string', description: 'The status to filter by.' }
          },
          required: ['status']
        }
      }
    ]
  }
];

export async function POST(req) {
  try {
    const { messages } = await req.json();
    
    // Use Gemini 3.1 Pro Preview for best reasoning and tool use
    const model = client.getGenerativeModel({ 
      model: 'gemini-3.1-pro-preview',
      tools: toolDefinitions 
    });

    const chat = model.startChat({
      history: messages.slice(0, -1).map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }]
      }))
    });

    const lastMessage = messages[messages.length - 1].content;
    let result = await chat.sendMessage(lastMessage);
    let response = result.response;

    // Handle Function Calling Loop
    const callCountLimit = 10;
    let callCount = 0;

    while (response.candidates[0].content.parts.some(p => p.functionCall) && callCount < callCountLimit) {
      callCount++;
      const functionCalls = response.candidates[0].content.parts
        .filter(p => p.functionCall)
        .map(p => p.functionCall);

      const toolResults = await Promise.all(functionCalls.map(async (call) => {
        const fn = tools[call.name];
        if (!fn) return { name: call.name, response: { error: 'Function not found' } };
        
        try {
          const res = await fn(...Object.values(call.args));
          return { name: call.name, response: { content: res } };
        } catch (err) {
          return { name: call.name, response: { error: err.message } };
        }
      }));

      result = await chat.sendMessage(toolResults.map(tr => ({
        functionResponse: tr
      })));
      response = result.response;
    }

    return NextResponse.json({ 
      content: response.candidates[0].content.parts[0].text 
    });

  } catch (error) {
    console.error('Chat API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
