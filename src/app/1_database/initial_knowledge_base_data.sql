-- Learning Paths for Prompt Engineering Basics
insert into zen_learning_paths (name, description, skill_id, order_index) 
select 
  'Fundamentals of Prompt Engineering',
  'Learn the core concepts and principles of writing effective prompts for AI models',
  id,
  1
from zen_skills where name = 'Prompt Engineering Basics';

-- Learning Materials for Prompt Engineering Basics
insert into zen_learning_materials (title, content, type, path_id, order_index)
select 
  'Introduction to Prompt Engineering',
  '# Introduction to Prompt Engineering

## What is Prompt Engineering?
Prompt engineering is the practice of designing and optimizing inputs (prompts) for AI language models to generate desired outputs. It''s a crucial skill for effectively working with AI systems.

## Key Concepts
1. Clear Instructions
2. Context Setting
3. Output Formatting
4. Constraint Definition

## Why is it Important?
- Better AI responses
- Consistent outputs
- Efficient problem-solving
- Cost optimization

## Getting Started
In this course, you''ll learn:
1. Basic prompt structure
2. Common patterns
3. Best practices
4. Real-world applications',
  'article',
  id,
  1
from zen_learning_paths where name = 'Fundamentals of Prompt Engineering';

insert into zen_learning_materials (title, content, type, path_id, order_index)
select 
  'Basic Prompt Structure',
  '# Basic Prompt Structure

## Components of an Effective Prompt
1. Context
2. Instruction
3. Examples (if needed)
4. Output format

## Example Structures

### Task-based Prompt
```
Context: You are a data analyst
Task: Analyze this sales data
Format: Provide insights in bullet points
Data: [sales data]
```

### Role-based Prompt
```
You are a [role]
Your task is to [action]
Please provide [output format]
```

## Practice Exercise
Write prompts for these scenarios:
1. Code review
2. Content summarization
3. Data analysis',
  'article',
  id,
  2
from zen_learning_paths where name = 'Fundamentals of Prompt Engineering';

-- Assessment for Prompt Engineering Basics
insert into zen_assessments (title, description, skill_id, passing_score, level)
select 
  'Prompt Engineering Basics Assessment',
  'Test your understanding of basic prompt engineering concepts',
  id,
  80,
  'beginner'
from zen_skills where name = 'Prompt Engineering Basics';

-- Assessment Questions
insert into zen_assessment_questions (assessment_id, question, answer_type, correct_answer, points)
select 
  id,
  'What are the four key components of an effective prompt?',
  'text',
  'context, instruction, examples, output format',
  25
from zen_assessments where title = 'Prompt Engineering Basics Assessment';

insert into zen_assessment_questions (assessment_id, question, answer_type, correct_answer, points)
select 
  id,
  'Write a role-based prompt for a technical documentation task.',
  'text',
  'You are a technical writer. Your task is to create documentation for a new API endpoint. Please provide the documentation in markdown format with sections for Description, Parameters, and Example Usage.',
  25
from zen_assessments where title = 'Prompt Engineering Basics Assessment';

-- Advanced Prompt Patterns Learning Path
insert into zen_learning_paths (name, description, skill_id, order_index)
select 
  'Advanced Prompt Engineering Techniques',
  'Master complex prompt patterns and advanced techniques for AI interaction',
  id,
  1
from zen_skills where name = 'Advanced Prompt Patterns';

-- Learning Materials for Advanced Patterns
insert into zen_learning_materials (title, content, type, path_id, order_index)
select 
  'Chain-of-Thought Prompting',
  '# Chain-of-Thought Prompting

## Understanding CoT
Chain-of-Thought (CoT) prompting is an advanced technique that helps AI models break down complex problems into steps.

## Key Benefits
1. Better reasoning
2. Transparent problem-solving
3. Improved accuracy
4. Debuggable outputs

## Implementation
```
Let''s solve this step by step:
1. First, we''ll...
2. Then, we can...
3. Finally, we...
```

## Examples and Use Cases
1. Math problem solving
2. Logic puzzles
3. Complex analysis
4. Decision making',
  'article',
  id,
  1
from zen_learning_paths where name = 'Advanced Prompt Engineering Techniques';

-- AI Agent Architecture Learning Path
insert into zen_learning_paths (name, description, skill_id, order_index)
select 
  'Building AI Agents',
  'Learn to design and implement AI agent systems with clear objectives and constraints',
  id,
  1
from zen_skills where name = 'AI Agent Architecture';

-- Learning Materials for AI Agents
insert into zen_learning_materials (title, content, type, path_id, order_index)
select 
  'AI Agent Fundamentals',
  '# AI Agent Fundamentals

## What is an AI Agent?
An AI agent is a system that can:
1. Perceive its environment
2. Make decisions
3. Take actions
4. Learn from outcomes

## Core Components
1. Perception System
2. Decision Engine
3. Action Framework
4. Learning Mechanism

## Implementation Patterns
```typescript
interface AIAgent {
  perceive(environment: Environment): Perception;
  decide(perception: Perception): Decision;
  act(decision: Decision): Action;
  learn(outcome: Outcome): void;
}
```

## Best Practices
1. Clear objective definition
2. Robust error handling
3. Monitoring and logging
4. Performance optimization',
  'article',
  id,
  1
from zen_learning_paths where name = 'Building AI Agents';

-- LLM Integration Learning Path
insert into zen_learning_paths (name, description, skill_id, order_index)
select 
  'LLM Integration Patterns',
  'Learn to effectively integrate Large Language Models into applications',
  id,
  1
from zen_skills where name = 'LLM Integration';

-- Learning Materials for LLM Integration
insert into zen_learning_materials (title, content, type, path_id, order_index)
select 
  'LLM Integration Basics',
  '# LLM Integration Basics

## Integration Patterns
1. Direct API calls
2. Streaming responses
3. Function calling
4. Embeddings

## Example Implementation
```typescript
async function queryLLM(prompt: string): Promise<string> {
  const response = await openai.createCompletion({
    model: "gpt-4",
    prompt,
    max_tokens4000,
    temperature: 0.7
  });
  return response.choices[0].text;
}
```

## Best Practices
1. Rate limiting
2. Error handling
3. Cost optimization
4. Response validation

## Security Considerations
1. API key management
2. Input sanitization
3. Output validation
4. User data protection',
  'article',
  id,
  1
from zen_learning_paths where name = 'LLM Integration Patterns';

-- System Optimization Learning Path
insert into zen_learning_paths (name, description, skill_id, order_index)
select 
  'AI System Optimization',
  'Master techniques for optimizing AI system performance and efficiency',
  id,
  1
from zen_skills where name = 'AI System Optimization';

-- Learning Materials for System Optimization
insert into zen_learning_materials (title, content, type, path_id, order_index)
select 
  'Performance Optimization Techniques',
  '# AI System Performance Optimization

## Key Areas
1. Response time
2. Token usage
3. Cost management
4. Quality assurance

## Optimization Techniques
1. Prompt optimization
2. Caching strategies
3. Batch processing
4. Response streaming

## Implementation Example
```typescript
class OptimizedLLMClient {
  private cache: Map<string, string>;
  private rateLimiter: RateLimiter;

  constructor() {
    this.cache = new Map();
    this.rateLimiter = new RateLimiter({
      tokensPerMinute: 10000
    });
  }

  async query(prompt: string): Promise<string> {
    // Check cache
    if (this.cache.has(prompt)) {
      return this.cache.get(prompt)!;
    }

    // Rate limiting
    await this.rateLimiter.wait();

    // Make API call
    const response = await this.makeApiCall(prompt);

    // Cache result
    this.cache.set(prompt, response);

    return response;
  }
}
```

## Monitoring and Analytics
1. Response times
2. Token usage
3. Cache hit rates
4. Error rates',
  'article',
  id,
  1
from zen_learning_paths where name = 'AI System Optimization';

-- Create assessments for each advanced skill
insert into zen_assessments (title, description, skill_id, passing_score, level)
select 
  'Advanced Prompt Patterns Assessment',
  'Demonstrate your mastery of advanced prompt engineering techniques',
  id,
  85,
  'intermediate'
from zen_skills where name = 'Advanced Prompt Patterns';

insert into zen_assessments (title, description, skill_id, passing_score, level)
select 
  'AI Agent Architecture Assessment',
  'Show your understanding of AI agent design and implementation',
  id,
  85,
  'intermediate'
from zen_skills where name = 'AI Agent Architecture';

insert into zen_assessments (title, description, skill_id, passing_score, level)
select 
  'LLM Integration Assessment',
  'Prove your ability to integrate LLMs effectively',
  id,
  85,
  'intermediate'
from zen_skills where name = 'LLM Integration';

insert into zen_assessments (title, description, skill_id, passing_score, level)
select 
  'System Optimization Assessment',
  'Demonstrate your expertise in AI system optimization',
  id,
  90,
  'expert'
from zen_skills where name = 'AI System Optimization'; 