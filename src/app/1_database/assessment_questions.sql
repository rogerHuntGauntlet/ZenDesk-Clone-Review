-- Questions for Advanced Prompt Patterns Assessment
insert into zen_assessment_questions (assessment_id, question, answer_type, correct_answer, points)
select 
  id,
  'Explain the concept of Chain-of-Thought prompting and provide an example.',
  'text',
  'Chain-of-Thought prompting is a technique that guides AI models through step-by-step reasoning. Example: "Let''s solve this math problem step by step: 1) First, identify the variables 2) Set up the equation 3) Solve for x"',
  20
from zen_assessments where title = 'Advanced Prompt Patterns Assessment';

insert into zen_assessment_questions (assessment_id, question, answer_type, correct_answer, points)
select 
  id,
  'Write a prompt that uses few-shot learning with three examples for sentiment analysis.',
  'text',
  'Analyze the sentiment of texts. Here are some examples:
Text: "I love this product!"
Sentiment: Positive
Text: "This is terrible."
Sentiment: Negative
Text: "It''s okay, nothing special."
Sentiment: Neutral
Now analyze this text: [input]',
  20
from zen_assessments where title = 'Advanced Prompt Patterns Assessment';

-- Questions for AI Agent Architecture Assessment
insert into zen_assessment_questions (assessment_id, question, answer_type, correct_answer, points)
select 
  id,
  'Implement a basic AI agent interface in TypeScript that includes perception, decision-making, and action methods.',
  'code',
  'interface Environment {
  state: any;
}

interface Perception {
  data: any;
}

interface Decision {
  action: string;
  parameters: any;
}

interface Action {
  execute(): Promise<void>;
}

class AIAgent {
  async perceive(env: Environment): Promise<Perception> {
    return { data: env.state };
  }

  async decide(perception: Perception): Promise<Decision> {
    return {
      action: "default",
      parameters: perception.data
    };
  }

  async act(decision: Decision): Promise<Action> {
    return {
      execute: async () => {
        // Execute the action
      }
    };
  }
}',
  30
from zen_assessments where title = 'AI Agent Architecture Assessment';

-- Questions for LLM Integration Assessment
insert into zen_assessment_questions (assessment_id, question, answer_type, correct_answer, points)
select 
  id,
  'Implement a rate-limited LLM client with error handling and response validation.',
  'code',
  'class LLMClient {
  private rateLimiter: RateLimiter;
  
  constructor(private apiKey: string) {
    this.rateLimiter = new RateLimiter({
      tokensPerMinute: 10000
    });
  }

  async query(prompt: string): Promise<string> {
    try {
      await this.rateLimiter.wait();
      
      const response = await fetch("https://api.openai.com/v1/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-4",
          prompt,
          max_tokens: 5000
        })
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      this.validateResponse(data);
      
      return data.choices[0].text;
    } catch (error) {
      console.error("LLM query failed:", error);
      throw error;
    }
  }

  private validateResponse(data: any) {
    if (!data.choices || !data.choices[0]?.text) {
      throw new Error("Invalid response format");
    }
  }
}',
  40
from zen_assessments where title = 'LLM Integration Assessment';

-- Questions for System Optimization Assessment
insert into zen_assessment_questions (assessment_id, question, answer_type, correct_answer, points)
select 
  id,
  'Design a caching and batching system for LLM requests that optimizes cost and performance.',
  'code',
  'class OptimizedLLMSystem {
  private cache: Map<string, CacheEntry>;
  private batchQueue: BatchRequest[];
  private batchTimeout: NodeJS.Timeout | null;

  constructor(
    private maxBatchSize: number = 10,
    private batchWaitMs: number = 100,
    private cacheTtlMs: number = 3600000
  ) {
    this.cache = new Map();
    this.batchQueue = [];
    this.batchTimeout = null;
  }

  async query(prompt: string): Promise<string> {
    // Check cache
    const cached = this.checkCache(prompt);
    if (cached) return cached;

    // Add to batch queue
    return new Promise((resolve, reject) => {
      this.batchQueue.push({
        prompt,
        resolve,
        reject,
        timestamp: Date.now()
      });

      this.scheduleBatch();
    });
  }

  private checkCache(prompt: string): string | null {
    const entry = this.cache.get(prompt);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > this.cacheTtlMs) {
      this.cache.delete(prompt);
      return null;
    }

    return entry.response;
  }

  private scheduleBatch() {
    if (this.batchTimeout) return;

    this.batchTimeout = setTimeout(async () => {
      await this.processBatch();
      this.batchTimeout = null;

      if (this.batchQueue.length > 0) {
        this.scheduleBatch();
      }
    }, this.batchWaitMs);
  }

  private async processBatch() {
    const batch = this.batchQueue.splice(0, this.maxBatchSize);
    if (batch.length === 0) return;

    try {
      const prompts = batch.map(req => req.prompt);
      const responses = await this.batchRequest(prompts);

      // Update cache and resolve promises
      responses.forEach((response, i) => {
        this.cache.set(batch[i].prompt, {
          response,
          timestamp: Date.now()
        });
        batch[i].resolve(response);
      });
    } catch (error) {
      batch.forEach(req => req.reject(error));
    }
  }

  private async batchRequest(prompts: string[]): Promise<string[]> {
    // Implement actual batch request to LLM API
    return Promise.resolve(prompts.map(() => "response"));
  }
}

interface BatchRequest {
  prompt: string;
  resolve: (response: string) => void;
  reject: (error: Error) => void;
  timestamp: number;
}

interface CacheEntry {
  response: string;
  timestamp: number;
}',
  50
from zen_assessments where title = 'System Optimization Assessment';

insert into zen_assessment_questions (assessment_id, question, answer_type, correct_answer, points)
select 
  id,
  'Explain three key strategies for optimizing LLM API costs and their trade-offs.',
  'text',
  '1. Caching: Store frequently requested prompts and responses. Trade-off between memory usage and API costs.
2. Batching: Combine multiple requests into one API call. Trade-off between latency and throughput.
3. Token optimization: Minimize prompt length and response tokens. Trade-off between context quality and cost.',
  25
from zen_assessments where title = 'System Optimization Assessment'; 