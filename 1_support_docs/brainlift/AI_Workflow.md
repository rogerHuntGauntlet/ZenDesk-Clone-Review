# OutreachGPT Service Architecture

## 1. Data Collection Service
```typescript
interface OutreachContextService {
  async getTicketContext(ticketId: string): Promise<TicketContext>;
  async getProjectContext(projectId: string): Promise<ProjectContext>;
  async getProspectHistory(prospectId: string): Promise<ProspectHistory>;
  async getInteractionHistory(ticketId: string): Promise<Interaction[]>;
}

interface TicketContext {
  id: string;
  title: string;
  description: string;
  status: string;
  category: string;
  priority: string;
  assignee?: {
    name: string;
    email: string;
  };
}
```

## 2. Context Assembly Service
```typescript
interface ContextAssemblyService {
  async assembleContext(ticketId: string): Promise<OutreachContext> {
    const ticket = await contextService.getTicketContext(ticketId);
    const project = await contextService.getProjectContext(ticket.project_id);
    const prospect = await contextService.getProspectHistory(ticket.prospect_id);
    const interactions = await contextService.getInteractionHistory(ticketId);

    return {
      ticket,
      project,
      prospect,
      interactions,
      timestamp: new Date()
    };
  }
}
```

## 3. Message Generation Service
```typescript
interface MessageGenerationService {
  async generateMessage(context: OutreachContext, userPrompt: string): Promise<OutreachResponse> {
    const prompt = this.buildPrompt(context, userPrompt);
    const completion = await openai.createChatCompletion({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "You are an expert sales communication assistant..."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens4000
    });

    return this.processResponse(completion);
  }

  private buildPrompt(context: OutreachContext, userPrompt: string): string {
    return `
      Context:
      Ticket: ${formatTicketContext(context.ticket)}
      Project: ${formatProjectContext(context.project)}
      History: ${formatInteractionHistory(context.interactions)}
      
      User Request: ${userPrompt}
      
      Generate a personalized outreach message that:
      1. Addresses the prospect's known preferences
      2. References relevant project details
      3. Maintains conversation continuity
      4. Includes appropriate call-to-action
    `;
  }
}
```

## 4. Response Handler Service
```typescript
interface OutreachResponse {
  message: string;
  metadata: {
    usedContext: string[];
    confidence: number;
    suggestedFollowUp: string;
  };
}

interface ResponseHandlerService {
  async processResponse(completion: any): Promise<OutreachResponse> {
    // Process the OpenAI response
    // Extract metadata
    // Format message
    // Add any compliance checks
    return {
      message: completion.choices[0].message.content,
      metadata: {
        usedContext: extractUsedContext(completion),
        confidence: calculateConfidence(completion),
        suggestedFollowUp: generateFollowUp(completion)
      }
    };
  }
}
```

## 5. Integration with TicketList Component
```typescript
// In TicketList.tsx
const handleCraftOutreach = async () => {
  if (!selectedTicket || !outreachPrompt) return;
  
  try {
    setIsLoading(true);
    
    const context = await contextAssemblyService.assembleContext(selectedTicket.id);
    const response = await messageGenerationService.generateMessage(context, outreachPrompt);
    
    // Update UI with generated message
    setGeneratedMessage(response.message);
    setMessageMetadata(response.metadata);
    
    // Store in ticket history
    await ticketService.addOutreachActivity(selectedTicket.id, {
      type: 'outreach_message',
      content: response.message,
      metadata: response.metadata
    });
    
  } catch (error) {
    handleError(error);
  } finally {
    setIsLoading(false);
  }
};
```

## 6. Error Handling
```typescript
interface ErrorHandlerService {
  handleError(error: any): void {
    if (error.code === 'CONTEXT_INVALID') {
      // Handle invalid context
    } else if (error.code === 'API_ERROR') {
      // Handle API errors
    } else if (error.code === 'RATE_LIMIT') {
      // Handle rate limiting
    }
  }
}
```

## 7. Activity Tracking Service
```typescript
interface ActivityTrackingService {
  async trackOutreachActivity(
    ticketId: string,
    messageId: string,
    activity: OutreachActivity
  ): Promise<void>;
  
  async updateEffectiveness(
    messageId: string,
    metrics: EffectivenessMetrics
  ): Promise<void>;
}
``` 