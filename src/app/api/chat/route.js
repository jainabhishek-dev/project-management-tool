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

// Define the response schema for Structured Output
const responseSchema = {
  type: Type.OBJECT,
  properties: {
    summary: {
      type: Type.STRING,
      description: "A clear, professional summary of the requested financial analysis. No HTML tags."
    },
    keyMetrics: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          label: { type: Type.STRING, description: "Display label for the metric (e.g., 'Total Approved')" },
          value: { type: Type.STRING, description: "The financial value with ₹ prefix and Indian numbering (e.g., '₹17.81 Lakhs')" }
        }
      },
      description: "Short list of the most important numbers related to the query."
    },
    table: {
      type: Type.OBJECT,
      properties: {
        headers: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Column names for the data table." },
        rows: {
          type: Type.ARRAY,
          items: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "An array of rows, where each row is an array of cell values."
          }
        }
      },
      description: "Detailed tabular data if requested (e.g., list of projects or budget breakdown)."
    },
    insights: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "A list of bulleted insights or observations about the data."
    }
  },
  required: ["summary", "keyMetrics"]
};

export async function POST(req) {
  try {
    const { messages } = await req.json();

    // Model Selection: Gemini 3.1 Pro Preview
    const modelId = 'gemini-3.1-pro-preview';

    // Step 1: Initialize conversation history
    let contents = messages.map(m => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }]
    }));

    let loopCount = 0;
    const MAX_LOOPS = 5;

    // Step 2: Generation config with Thinking AND Structured Output
    const config = {
      tools: toolDefinitions,
      thinkingConfig: { includeThoughts: true },
      responseMimeType: "application/json",
      responseJsonSchema: responseSchema,
      systemInstruction: `You are an expert LeadSchool Project Manager. 
      
RULES:
1. DATA: Fetch REAL data from Supabase using your tools.
2. CURRENCY: All database values are strictly in Indian Rupees (₹). Always use ₹ prefix and Indian numbering (Lakhs/Crores).
3. OUTPUT: You MUST return a JSON object matching the provided schema. 
4. NO HTML: Never use <strong>, <table>, or other tags.
5. CONCISENESS: Summaries must be direct. Avoid "The organization currently has..." or "Okay, let me...". Start directly with the data.
6. INSIGHTS: Do not include bullet points (•, -, *) in the insights array strings. Just provide the text.`
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
        // Final response logic: Carefully find the JSON part, ignoring thinking/monologue parts
        const finalJsonPart = candidate.parts.find(p => p.text && !p.thought);

        return NextResponse.json({
          content: finalJsonPart ? finalJsonPart.text : "{ \"error\": \"No valid data returned\" }"
        });
      }
    }

    return NextResponse.json({
      error: "Max analysis steps reached. Please try a more specific question."
    }, { status: 429 });

  } catch (error) {
    console.error('LeadSchool Chat Engine Error:', error);
    return NextResponse.json({
      error: `Engine Error: ${error.message}`,
      details: error.status === 'INVALID_ARGUMENT' ? "Structural schema mismatch - check parts structure." : null
    }, { status: 500 });
  }
}
