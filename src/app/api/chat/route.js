import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';
import * as tools from '@/lib/ai/tools';

// Initialize the Gemini client
const client = new GoogleGenAI({
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY
});

// Use Type enum as per documentation for schema consistency
const toolDefinitions = [
  {
    functionDeclarations: [
      {
        name: 'list_all_projects',
        description: 'Lists all projects in the database, including their academic years.',
        parameters: { type: Type.OBJECT, properties: {} }
      },
      {
        name: 'get_project_details',
        description: 'Gets detailed information for a specific project by name.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            projectName: { type: Type.STRING, description: 'The name of the project to look up.' }
          },
          required: ['projectName']
        }
      },
      {
        name: 'get_budgets_for_project',
        description: 'Lists all budget versions across all stages for a specific project.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            projectName: { type: Type.STRING, description: 'The name of the project.' }
          },
          required: ['projectName']
        }
      },
      {
        name: 'get_budget_breakdown_by_role',
        description: 'Gets the financial breakdown (costs) grouped by professional roles for a specific budget ID.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            budgetId: { type: Type.STRING, description: 'The unique UUID of the budget.' }
          },
          required: ['budgetId']
        }
      },
      {
        name: 'get_budget_breakdown_by_section',
        description: 'Gets the financial breakdown (subtotals) grouped by operational sections for a specific budget ID.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            budgetId: { type: Type.STRING, description: 'The unique UUID of the budget.' }
          },
          required: ['budgetId']
        }
      },
      {
        name: 'find_costliest_line_items',
        description: 'Finds the top 5 most expensive individual tasks/line items in a specific budget ID.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            budgetId: { type: Type.STRING, description: 'The unique UUID of the budget.' },
            limit: { type: Type.NUMBER, description: 'Number of items to return (default 5).' }
          },
          required: ['budgetId']
        }
      },
      {
        name: 'get_org_summary_stats',
        description: 'Gets high-level organization-wide budget statistics across all projects.',
        parameters: { type: Type.OBJECT, properties: {} }
      },
      {
        name: 'search_budgets_by_status',
        description: 'Finds all budgets across the organization with a specific status (draft, submitted, approved, rejected).',
        parameters: {
          type: Type.OBJECT,
          properties: {
            status: { type: Type.STRING, description: 'The status to filter by.' }
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
    
    // Model Selection: Gemini 3.1 Pro Preview as per docs
    const modelId = 'gemini-3.1-pro-preview';

    // Step 1: Initialize conversation history with strict Parts structure
    // This avoids the "required oneof field 'data'" error
    let contents = messages.map(m => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }]
    }));

    let finalContent = '';
    let loopCount = 0;
    const MAX_LOOPS = 5;

    // Step 2: Generation config with thinking enabled for better reasoning
    const config = {
      tools: toolDefinitions,
      thinkingConfig: { includeThoughts: true },
      systemInstruction: `You are an expert LeadSchool Finance Analyst. 
      
RULES:
1. DATA SOURCE: Use the provided tools to fetch REAL data from the Supabase database.
2. CURRENCY: The underlying database stores all financial values strictly in Indian Rupees (₹). Always prefix amounts with '₹' and use the Indian numbering system (Lakhs/Crores) for readability (e.g., ₹1,00,000 instead of ₹100,000).
3. FORMATTING: Strictly use Markdown ONLY. 
   - Use **text** for bold.
   - Use - for bullet points.
   - Use | for tables.
   - NEVER output HTML tags (no <strong>, <table>, <p>, etc.) as they break the UI parser.
4. ANALYST PERSONA: Be professional, concise, and provide actionable insights. If you notice a high budget or cost outlier, mention it.`
    };

    while (loopCount < MAX_LOOPS) {
      loopCount++;

      const result = await client.models.generateContent({
        model: modelId,
        contents: contents,
        config: config
      });

      const candidate = result.candidates[0].content;
      
      // Check for function calls in the model's preferred response segment
      const functionCalls = result.functionCalls;
      
      if (functionCalls && functionCalls.length > 0) {
        // RULE (from docs): Return the entire response part (including thoughtSignature) back to history
        contents.push(candidate);

        // Execute all requested tools
        const functionResponseParts = await Promise.all(functionCalls.map(async (call) => {
          const fnName = call.name;
          const args = call.args;
          const fn = tools[fnName];

          console.log(`LeadSchool AI invoking: ${fnName}`, args);

          try {
            const toolData = await fn(...Object.values(args));
            return {
              functionResponse: {
                name: fnName,
                response: { result: toolData }
              }
            };
          } catch (err) {
            return {
              functionResponse: {
                name: fnName,
                response: { error: err.message }
              }
            };
          }
        }));

        // RULE: Return function responses in a new 'user' role turn
        contents.push({
          role: 'user',
          parts: functionResponseParts
        });
      } else {
        // No more tool calls, we have the final answer
        // Extract text while ignoring internal thinking parts for the final UI response
        finalContent = candidate.parts
          .filter(p => p.text && !p.thought)
          .map(p => p.text)
          .join('\n');
        break;
      }
    }

    return NextResponse.json({ 
      content: finalContent || "I've analyzed the data but couldn't formulate a response. Please try rephrasing."
    });

  } catch (error) {
    console.error('LeadSchool Chat Engine Error:', error);
    return NextResponse.json({ 
      error: `Engine Error: ${error.message}`,
      details: error.status === 'INVALID_ARGUMENT' ? "Structural schema mismatch - check parts structure." : null
    }, { status: 500 });
  }
}
