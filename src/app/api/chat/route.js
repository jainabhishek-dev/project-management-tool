import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import * as tools from '@/lib/ai/tools';

// Initialize the Gemini v2 client
const client = new GoogleGenAI({
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY
});

// Define tools for the model in OpenAI-compatible format (used by genai v2)
const toolDefinitions = [
  {
    functionDeclarations: [
      {
        name: 'list_all_projects',
        description: 'Lists all projects in the database, including their academic years.',
        parameters: { type: 'OBJECT', properties: {} }
      },
      {
        name: 'get_project_details',
        description: 'Gets detailed information for a specific project by name.',
        parameters: {
          type: 'OBJECT',
          properties: {
            projectName: { type: 'STRING', description: 'The name of the project to look up.' }
          },
          required: ['projectName']
        }
      },
      {
        name: 'get_budgets_for_project',
        description: 'Lists all budget versions across all stages for a specific project.',
        parameters: {
          type: 'OBJECT',
          properties: {
            projectName: { type: 'STRING', description: 'The name of the project.' }
          },
          required: ['projectName']
        }
      },
      {
        name: 'get_budget_breakdown_by_role',
        description: 'Gets the financial breakdown (costs) grouped by professional roles for a specific budget ID.',
        parameters: {
          type: 'OBJECT',
          properties: {
            budgetId: { type: 'STRING', description: 'The unique UUID of the budget.' }
          },
          required: ['budgetId']
        }
      },
      {
        name: 'get_budget_breakdown_by_section',
        description: 'Gets the financial breakdown (subtotals) grouped by operational sections for a specific budget ID.',
        parameters: {
          type: 'OBJECT',
          properties: {
            budgetId: { type: 'STRING', description: 'The unique UUID of the budget.' }
          },
          required: ['budgetId']
        }
      },
      {
        name: 'find_costliest_line_items',
        description: 'Finds the top 5 most expensive individual tasks/line items in a specific budget ID.',
        parameters: {
          type: 'OBJECT',
          properties: {
            budgetId: { type: 'STRING', description: 'The unique UUID of the budget.' },
            limit: { type: 'NUMBER', description: 'Number of items to return (default 5).' }
          },
          required: ['budgetId']
        }
      },
      {
        name: 'get_org_summary_stats',
        description: 'Gets high-level organization-wide budget statistics across all projects.',
        parameters: { type: 'OBJECT', properties: {} }
      },
      {
        name: 'search_budgets_by_status',
        description: 'Finds all budgets across the organization with a specific status (draft, submitted, approved, rejected).',
        parameters: {
          type: 'OBJECT',
          properties: {
            status: { type: 'STRING', description: 'The status to filter by.' }
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
    
    // In @google/genai v2, we use models.generateContent directly
    const modelId = 'gemini-2.0-flash'; // Using the latest stable powerful model for genai v2
    const lastMessage = messages[messages.length - 1].content;

    // Construct conversation history
    const history = messages.slice(0, -1).map(m => ({
      role: m.role === 'user' ? 'user' : 'model',
      content: m.content
    }));

    // Start of the tool loop
    let currentMessages = [...history, { role: 'user', content: lastMessage }];
    let finalContent = '';
    let loopCount = 0;
    const MAX_LOOPS = 5;

    while (loopCount < MAX_LOOPS) {
      loopCount++;

      const result = await client.models.generateContent({
        model: modelId,
        contents: currentMessages,
        tools: toolDefinitions,
        systemInstruction: "You are an expert LeadSchool Finance Analyst. Use the provided tools to fetch real data from the database. Do not hallucinate. Format financial data in clear tables or bold text."
      });

      const choice = result.candidates[0].content;
      
      // If there's a tool call (functionCall)
      const functionCalls = choice.parts.filter(p => p.functionCall);
      
      if (functionCalls.length > 0) {
        // Add the model's tool request to history
        currentMessages.push(choice);

        // Execute all requested tools
        const responses = await Promise.all(functionCalls.map(async (call) => {
          const fnName = call.functionCall.name;
          const args = call.functionCall.args;
          const fn = tools[fnName];

          console.log(`AI invoking tool: ${fnName}`, args);

          try {
            const toolData = await fn(...Object.values(args));
            return {
              role: 'tool',
              content: [
                {
                  functionResponse: {
                    name: fnName,
                    response: { content: toolData }
                  }
                }
              ]
            };
          } catch (err) {
            return {
              role: 'tool',
              content: [
                {
                  functionResponse: {
                    name: fnName,
                    response: { error: err.message }
                  }
                }
              ]
            };
          }
        }));

        // Add tool responses to history for the next turn
        currentMessages.push(...responses);
      } else {
        // No more tool calls, we have the final answer
        finalContent = choice.parts.map(p => p.text).join(' ');
        break;
      }
    }

    return NextResponse.json({ 
      content: finalContent || "I'm sorry, I couldn't process that request."
    });

  } catch (error) {
    console.error('Chat API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
