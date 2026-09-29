خیلی خوب، حالا بذار یه تحلیل جامع بدم هم در مورد **پروایدرهای رایگان** و هم مشکل **بکند** در Google AI Studio و راه‌حل پلاگین تو.

---

# بخش ۱: نقشه کامل پروایدرهای رایگان (بروز ۲۰۲۶) 🗺️

## حرف تو ۱۰۰٪ درسته — مدل‌های رایگان قوی وجود دارن

Free AI API ها الان به توسعه‌دهندگان ظرفیت کافی می‌دن برای نمونه‌سازی، بنچمارک و اجرای اپلیکیشن‌های کم‌حجم بدون پرداخت. مدل‌های frontier مثل Gemini 2.5 Flash، Llama 4 و Qwen3 235B از طریق پلتفرم‌های منتخب با قیمت $0 در دسترسن.

با تنظیم درست، توسعه‌دهندگان می‌تونن چند free tier رو روی هم بذارن و بیش از ۵۰۰۰ درخواست API در روز بدون مدیریت زیرساخت خودشون انجام بدن.

### جدول مرجع پروایدرهای رایگان

| پروایدر                   | مدل‌های کلیدی رایگان                        | ویژگی خاص                       | کارت اعتباری | API Style         |
| ------------------------- | ------------------------------------------- | ------------------------------- | ------------ | ----------------- |
| **Groq**                  | Llama 3.3 70B, Llama 4 Scout, Qwen, GPT-OSS | ⚡ سریع‌ترین (۵۰۰+ tok/s)        | ❌ نیاز نیست  | OpenAI-compatible |
| **Cerebras**              | Llama 3.1 8B, GPT-OSS 120B, GLM 4.7         | 🏆 ۱M توکن/روز رایگان           | ❌ نیاز نیست  | OpenAI-compatible |
| **Google AI Studio**      | Gemini 2.5 Flash, Flash-Lite                | 📄 ۱M context window            | ❌ نیاز نیست  | Google SDK        |
| **SambaNova**             | DeepSeek, Llama 4 Maverick, Qwen            | 🔧 $5 کردیت رایگان              | ❌ نیاز نیست  | OpenAI-compatible |
| **DeepSeek**              | DeepSeek V3.2, R1                           | 🧠 بهترین برای coding/reasoning | ❌ نیاز نیست  | OpenAI-compatible |
| **OpenRouter**            | +۲۰ مدل رایگان                              | 🌐 یک کلید = همه مدل‌ها         | ❌ نیاز نیست  | OpenAI-compatible |
| **HuggingFace**           | ۱۰۰+ مدل اپن‌سورس                           | 🔗 Gateway به ۱۵+ پروایدر       | ❌ نیاز نیست  | OpenAI-compatible |
| **Mistral**               | Mistral مدل‌ها                              | 🇫🇷 مدل‌های اروپایی            | ❌ نیاز نیست  | OpenAI-compatible |
| **NVIDIA NIM**            | مدل‌های متنوع                               | 🖥️ ارزیابی رایگان              | ❌ نیاز نیست  | OpenAI-compatible |
| **Cloudflare Workers AI** | مدل‌های متنوع                               | ☁️ ۱۰,۰۰۰ neurons/day           | ❌ نیاز نیست  | REST              |
| **GitHub Models**         | مدل‌های متنوع                               | 🐙 رایگان برای نمونه‌سازی       | ❌ نیاز نیست  | OpenAI-compatible |
| **Fireworks**             | Llama, DeepSeek, Qwen, FLUX                 | 🎆 $1 کردیت اولیه               | ✅            | OpenAI-compatible |

### جزئیات بیشتر هر پروایدر:

**🔵 Groq:**
Groq یک تیر رایگان واقعی بدون نیاز به کارت اعتباری ارائه می‌ده با دسترسی به تمام مدل‌ها روی سخت‌افزار فوق‌سریع LPU، که فقط با rate limit محدود شده — سیستم اعتباری و هزینه per-token وجود نداره. چیپ‌های LPU گروق ۲۰۰۰ تا ۳۰۰۰ توکن در ثانیه روی مدل‌های کوچکتر تولید می‌کنن، که ۵ تا ۱۰ برابر سریع‌تر از پروایدرهای مبتنی بر GPU هست.

**🔵 Cerebras:**
Cerebras یکی از سخاوتمندانه‌ترین تیرهای رایگان رو ارائه می‌ده — ۱,۰۰۰,۰۰۰ توکن رایگان در روز، بدون کارت اعتباری — روی سخت‌افزار inference فوق‌سریع. این یک تیر رایگان با rate-limit هست که روزانه ریست می‌شه، نه یک کردیت یکبار مصرف.

**🔵 SambaNova:**
SambaCloud یک REST API سازگار با OpenAI ارائه می‌ده که شروع ساخت رو در عرض چند دقیقه بسیار آسان می‌کنه. دسترسی به مدل‌های مختلف از جمله DeepSeek، Llama و Qwen وجود داره.

**🔵 HuggingFace (به عنوان Gateway):**
Hugging Face Inference API در ۲۰۲۶ سه محصول زیر یک چتر هست: Serverless Inference API (تیر رایگان با rate limit، بهترین برای نمونه‌سازی)، Inference Endpoints، و Inference Providers (یک gateway سازگار با OpenAI که به Groq، Together AI، Fireworks، Replicate، Cerebras و ۱۰+ پروایدر دیگه مسیریابی می‌کنه).

**🔵 بهترین مدل‌های اپن‌سورس ۲۰۲۶:**
قوی‌ترین مدل‌های اپن‌سورس شامل Llama 4 Scout برای تسک‌های long-context با ۱۰ میلیون توکن context window و DeepSeek V3.2 برای reasoning و coding هستن. Qwen3 235B یکی از بهترین گزینه‌ها برای اپلیکیشن‌های چندزبانه‌ست.

### نکته کلیدی:
بیشتر تیرهای رایگان API سازگار با OpenAI هستن، پس شما SDK خودتون رو به base URL پروایدر با کلید رایگانتون اشاره می‌دید.

---

# بخش ۲: حرفت درباره ضعف بکند Google AI Studio ۱۰۰٪ درسته ✅

Google AI Studio قابلیت ساخت اپ‌های full stack رو فراهم می‌کنه ولی عمدتاً با prompt و Annotation mode (که بخشی از UI رو هایلایت کنی و تغییر خواسته شده رو توضیح بدی).

### محدودیت‌های واقعی بکند در Build with Gemini:

برای سرویس‌های دیپلوی شده با Starter Tier، محدودیت‌ها شامل: فقط ۲ سرویس می‌تونی دیپلوی کنی و سرویس‌هات در یک منطقه Cloud Run دیپلوی می‌شن.

اپ‌های اندرویدی فقط client-side هستن: قابلیت‌هایی که نیاز به server runtime دارن (مدیریت secrets، multiplayer، Firebase، API های Google Workspace) در دسترس نیستن.

**خلاصه مشکلات بکند AI Studio:**

| محدودیت | توضیح |
|---|---|
| ❌ دیتابیس واقعی نداره | SQLite/PostgreSQL/MongoDB → ❌ |
| ❌ Authentication محدود | سیستم کاربری حرفه‌ای → ❌ |
| ❌ WebSocket/Realtime | ارتباط بلادرنگ → ❌ |
| ❌ Background Jobs | Cron jobs, queues → ❌ |
| ❌ File System دسترسی کامل | ذخیره‌سازی فایل سمت سرور → ❌ |
| ❌ Custom API endpoints | REST API سفارشی → محدود |
| ❌ فقط ۲ دیپلوی | مقیاس‌پذیری → ❌ |
| ❌ فقط Gemini | مدل‌های دیگه → ❌ |

---

# بخش ۳: راه‌حل — پلاگین Obsidian با قدرت بکند کامل 🚀

## فلسفه طراحی: **"AI Studio برای بکند"**

ایده اصلی: یه محیط درون Obsidian بسازیم که نه فقط چت ساده باشه، بلکه **ابزار تولید، طراحی و ساخت بکند** باشه.

## معماری پیشنهادی نهایی

```
┌─────────────────────────────────────────────────────────┐
│                    OBSIDIAN AI FORGE                      │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐ │
│  │                   Mode Selector                      │ │
│  │  [💬 Chat] [🏗️ Build] [🔧 Backend] [📊 Compare]    │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                           │
│  ┌──────────────────┐  ┌──────────────────────────────┐  │
│  │  Provider Panel   │  │      Main Workspace          │  │
│  │                   │  │                              │  │
│  │  ☑ Groq           │  │  System Prompt:              │  │
│  │  ☑ Cerebras       │  │  ┌────────────────────────┐  │  │
│  │  ☑ DeepSeek       │  │  │ You are a senior       │  │  │
│  │  ☑ SambaNova      │  │  │ backend engineer...    │  │  │
│  │  ☐ Gemini         │  │  └────────────────────────┘  │  │
│  │  ☑ OpenRouter     │  │                              │  │
│  │  ☑ HuggingFace    │  │  Chat / Code Output:         │  │
│  │  ☑ Cerebras       │  │  ┌────────────────────────┐  │  │
│  │  ☑ Fireworks      │  │  │                        │  │  │
│  │  ☐ NVIDIA NIM     │  │  │  [streaming response]  │  │  │
│  │                   │  │  │                        │  │  │
│  │  Model: ▼         │  │  └────────────────────────┘  │  │
│  │  [DeepSeek V3.2]  │  │                              │  │
│  │                   │  │  ┌────────────────────────┐  │  │
│  │  Temperature: 0.7 │  │  │ 📎 Attach vault files  │  │  │
│  │  Max Tokens: 8192 │  │  │ 📁 Attach project dir  │  │  │
│  │  Top-P: 0.9       │  │  │ 🗃️ Schema context     │  │  │
│  │                   │  │  └────────────────────────┘  │  │
│  └──────────────────┘  └──────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## قابلیت‌های ویژه بکند که AI Studio نداره ← ما داریم!

### 🔧 ۱. Backend Project Templates (System Prompts تخصصی)

```typescript
// src/templates/backend-templates.ts

export const BACKEND_TEMPLATES = {
  
  // ——— API Design ———
  'rest-api-design': {
    name: '🔌 REST API Designer',
    systemPrompt: `You are a senior backend architect. When the user describes 
a feature, you output:
1. OpenAPI 3.1 spec (YAML)
2. Database schema (SQL or Prisma)  
3. Route handlers (Express/FastAPI/Go)
4. Input validation (Zod/Pydantic)
5. Error handling patterns
6. Authentication middleware
Always ask clarifying questions about scale, auth method, and database choice.`,
    suggestedModels: ['deepseek-v3.2', 'qwen3-235b'],
    category: 'backend'
  },

  // ——— Database Architecture ———
  'db-architect': {
    name: '🗃️ Database Architect',
    systemPrompt: `You are a database architect expert in PostgreSQL, MongoDB, 
Redis, and SQLite. For any feature request:
1. Suggest optimal schema design with proper normalization
2. Define indexes for common query patterns
3. Write migration files (Prisma/Knex/Alembic)
4. Suggest caching strategy with Redis
5. Handle relationships (1:1, 1:N, N:N)
6. Consider partitioning for scale
Output complete, copy-paste ready SQL/Prisma schemas.`,
    suggestedModels: ['deepseek-v3.2', 'llama-4-scout'],
    category: 'backend'
  },

  // ——— DevOps & Infrastructure ———
  'devops-engineer': {
    name: '🐳 DevOps Engineer',
    systemPrompt: `You are a DevOps/SRE expert. Help with:
1. Dockerfile & docker-compose.yml (multi-stage, optimized)
2. CI/CD pipelines (GitHub Actions, GitLab CI)
3. Kubernetes manifests (Deployment, Service, Ingress, HPA)
4. Nginx/Caddy reverse proxy configs
5. Environment management (.env patterns)
6. Monitoring & logging (Prometheus, Grafana, ELK)
Always output production-ready, security-hardened configurations.`,
    suggestedModels: ['llama-3.3-70b', 'deepseek-v3.2'],
    category: 'devops'
  },

  // ——— Authentication System ———
  'auth-system': {
    name: '🔐 Auth System Builder',
    systemPrompt: `You are an authentication/authorization expert.
Design complete auth systems including:
1. JWT access/refresh token flows
2. OAuth2 (Google, GitHub, Discord)
3. RBAC/ABAC permission systems
4. Session management
5. Password hashing (bcrypt/argon2)
6. Rate limiting & brute-force protection
7. 2FA/MFA implementation
Provide complete, secure, production-ready code.`,
    suggestedModels: ['deepseek-v3.2', 'qwen3-235b'],
    category: 'backend'
  },

  // ——— Microservices ———
  'microservices': {
    name: '🏗️ Microservices Architect',
    systemPrompt: `You design microservice architectures. For each service:
8. Service boundaries & domain-driven design
9. Inter-service communication (gRPC, message queues, events)
10. API Gateway patterns
11. Service discovery
12. Saga pattern for distributed transactions
13. Circuit breaker & retry patterns
14. Complete docker-compose for local development`,
    suggestedModels: ['deepseek-v3.2', 'llama-4-scout'],
    category: 'backend'
  },

  // ——— Testing ———
  'test-engineer': {
    name: '🧪 Test Engineer',
    systemPrompt: `You write comprehensive tests. For any code:
15. Unit tests (Jest/Pytest/Go test)
16. Integration tests with test databases
17. API tests (supertest/httpx)
18. Mock strategies & test fixtures
19. E2E test scenarios
20. Load testing scripts (k6/Artillery)
21. Test coverage analysis`,
    suggestedModels: ['deepseek-v3.2', 'llama-3.3-70b'],
    category: 'testing'
  }
};
```

### 🔧 ۲. Context Injection — خوراک دادن فایل‌های پروژه به AI

```typescript
// src/features/ProjectContext.ts
// ✅ این چیزیه که AI Studio نداره — شما فایل‌های واقعی پروژتون رو به AI می‌دید

export class ProjectContextManager {
  
  /**
   * اسکن یک دایرکتوری پروژه و ساخت context map
   */
  async buildProjectContext(projectPath: string): Promise<ProjectContext> {
    const files = await this.scanDirectory(projectPath);
    
    return {
      // ساختار پروژه
      tree: this.generateTree(files),
      
      // فایل‌های مهم بکند
      packageJson: await this.readIfExists('package.json'),
      prismaSchema: await this.readIfExists('prisma/schema.prisma'),
      dockerFile: await this.readIfExists('Dockerfile'),
      envExample: await this.readIfExists('.env.example'),
      
      // روت‌ها و مدل‌ها
      routes: await this.findFiles('**/routes/**/*.{ts,js,py}'),
      models: await this.findFiles('**/models/**/*.{ts,js,py}'),
      migrations: await this.findFiles('**/migrations/**/*'),
      tests: await this.findFiles('**/*.{test,spec}.{ts,js,py}'),
      
      // تخمین توکن
      totalTokens: this.estimateTokens(files)
    };
  }

  /**
   * ساخت prompt context از فایل‌های پروژه
   */
  buildContextPrompt(context: ProjectContext, userQuery: string): string {
    return `
## Project Structure:
\`\`\`
${context.tree}
\`\`\`

## Database Schema (Prisma):
\`\`\`prisma
${context.prismaSchema}
\`\`\`

## Current Routes:
${context.routes.map(r => `### ${r.path}\n\`\`\`\n${r.content}\n\`\`\``).join('\n')}

## Environment Variables:
\`\`\`
${context.envExample}
\`\`\`

## User Request:
${userQuery}

Please provide a complete implementation that integrates with the existing codebase.
`;
  }
}
```

### 🔧 ۳. Smart Model Router — مدل درست برای تسک درست

```typescript
// src/features/SmartRouter.ts

export class SmartModelRouter {
  
  /**
   * بر اساس نوع تسک، بهترین مدل و پروایدر رایگان رو انتخاب کن
   */
  async selectBestModel(task: TaskType, config: RouterConfig): Promise<ModelSelection> {
    
    const routing: Record<TaskType, ModelPriority[]> = {
      // ——— کدنویسی بکند ———
      'backend-code': [
        { provider: 'deepseek', model: 'deepseek-chat', reason: 'Best for coding' },
        { provider: 'groq', model: 'llama-3.3-70b-versatile', reason: 'Fast fallback' },
        { provider: 'sambanova', model: 'DeepSeek-V3.1-Terminus', reason: 'SN speed' },
      ],
      
      // ——— طراحی دیتابیس و اسکیما ———
      'database-design': [
        { provider: 'deepseek', model: 'deepseek-chat', reason: 'Strong SQL/schema' },
        { provider: 'cerebras', model: 'gpt-oss-120b', reason: '1M tokens/day free' },
        { provider: 'openrouter', model: 'qwen/qwen3-235b', reason: 'Great reasoning' },
      ],
      
      // ——— بررسی کد و دیباگ ———
      'code-review': [
        { provider: 'deepseek', model: 'deepseek-reasoner', reason: 'Deep analysis' },
        { provider: 'groq', model: 'llama-3.3-70b-versatile', reason: 'Fast review' },
      ],
      
      // ——— DevOps / Docker / CI-CD ———
      'devops': [
        { provider: 'groq', model: 'llama-3.3-70b-versatile', reason: 'Fast configs' },
        { provider: 'cerebras', model: 'gpt-oss-120b', reason: 'Large context' },
      ],
      
      // ——— تحلیل کدبیس بزرگ (نیاز به context بالا) ———
      'large-codebase': [
        { provider: 'google', model: 'gemini-2.5-flash', reason: '1M context' },
        { provider: 'sambanova', model: 'Llama-4-Scout', reason: '10M context' },
      ],
      
      // ——— تست نویسی ———
      'testing': [
        { provider: 'deepseek', model: 'deepseek-chat', reason: 'Great test gen' },
        { provider: 'groq', model: 'llama-3.3-70b-versatile', reason: 'Fast' },
      ],
    };

    // Failover: اگر پروایدر اول rate-limit خورد، بره سراغ بعدی
    for (const candidate of routing[task]) {
      const available = await this.checkAvailability(candidate.provider);
      if (available) return candidate;
    }
    
    // Fallback نهایی: OpenRouter
    return { provider: 'openrouter', model: 'auto', reason: 'Universal fallback' };
  }

  /**
   * بررسی rate limit هر پروایدر
   */
  private async checkAvailability(provider: string): Promise<boolean> {
    const usage = this.rateLimitTracker.get(provider);
    if (!usage) return true;
    return usage.remaining > 0;
  }
}
```

### 🔧 ۴. Provider Stacking — ترکیب چند پروایدر رایگان

```typescript
// src/features/ProviderStacker.ts
// ✅ ایده کلیدی: وقتی rate limit یه پروایدر تموم شد، خودکار بره بعدی

export class ProviderStacker {
  private providers: LLMProvider[] = [];
  private usageTracker: Map<string, UsageStats> = new Map();

  constructor(configs: ProviderConfig[]) {
    // ساخت پروایدرها به ترتیب اولویت
    this.providers = configs
      .filter(c => c.apiKey) // فقط پروایدرهایی که API key دارن
      .sort((a, b) => a.priority - b.priority)
      .map(c => this.createProvider(c));
  }

  async chat(
    messages: ChatMessage[], 
    config: ModelConfig,
    onChunk: (chunk: string) => void
  ): Promise<{ text: string; provider: string; model: string }> {
    
    for (const provider of this.providers) {
      try {
        // بررسی rate limit
        const usage = this.usageTracker.get(provider.name);
        if (usage && usage.isExhausted()) {
          console.log(`⏳ ${provider.name} rate limited, trying next...`);
          continue;
        }

        const text = await provider.chat(messages, config.model, config, onChunk);
        
        // ثبت مصرف
        this.trackUsage(provider.name, messages, text);
        
        return { text, provider: provider.name, model: config.model };
        
      } catch (error) {
        if (this.isRateLimitError(error)) {
          this.markExhausted(provider.name);
          continue; // بره بعدی
        }
        throw error;
      }
    }
    
    throw new Error('All providers exhausted! Try again later.');
  }

  /**
   * نمایش وضعیت مصرف هر پروایدر
   */
  getUsageDashboard(): ProviderUsage[] {
    return this.providers.map(p => ({
      name: p.name,
      used: this.usageTracker.get(p.name)?.tokensUsed || 0,
      limit: this.getLimit(p.name),
      remaining: this.getRemaining(p.name),
      resetsAt: this.getResetTime(p.name),
      status: this.getStatus(p.name) // 🟢 🟡 🔴
    }));
  }
}
```

### 🔧 ۵. Backend Workflow Builder — ساخت بکند مرحله به مرحله

```typescript
// src/features/BackendWorkflow.ts
// ✅ اینجاست که AI Studio رو شکست می‌دیم!

export class BackendWorkflowBuilder {
  
  /**
   * یک پروژه بکند کامل از صفر بسازه
   * هر مرحله رو با مدل بهینه انجام بده
   */
  async buildFullBackend(spec: ProjectSpec): Promise<BackendProject> {
    const results: WorkflowStep[] = [];
    
    // مرحله ۱: طراحی دیتابیس — با DeepSeek (بهترین برای schema)
    const dbSchema = await this.router.execute({
      task: 'database-design',
      prompt: `Design a database schema for: ${spec.description}
               Requirements: ${spec.requirements.join(', ')}
               Tech stack: ${spec.database}`,
      outputFormat: 'prisma-schema'
    });
    results.push({ name: 'Database Schema', output: dbSchema });
    
    // مرحله ۲: API Routes — با DeepSeek/Groq
    const apiRoutes = await this.router.execute({
      task: 'backend-code',
      prompt: `Based on this schema:\n${dbSchema}\n
               Create REST API routes for all CRUD operations.
               Framework: ${spec.framework}
               Include: validation, error handling, pagination`,
      outputFormat: 'code'
    });
    results.push({ name: 'API Routes', output: apiRoutes });
    
    // مرحله ۳: Authentication — با DeepSeek
    const auth = await this.router.execute({
      task: 'backend-code',
      prompt: `Implement authentication for the API above.
               Method: ${spec.authMethod}
               Include: login, register, refresh token, middleware`,
      context: [dbSchema, apiRoutes],
      outputFormat: 'code'
    });
    results.push({ name: 'Authentication', output: auth });
    
    // مرحله ۴: تست‌ها — با Groq (سریع!)
    const tests = await this.router.execute({
      task: 'testing',
      prompt: `Write comprehensive tests for:\n${apiRoutes}\n
               Include: unit tests, integration tests, auth tests`,
      outputFormat: 'code'
    });
    results.push({ name: 'Tests', output: tests });
    
    // مرحله ۵: Docker & DevOps — با Groq/Cerebras
    const devops = await this.router.execute({
      task: 'devops',
      prompt: `Create Docker setup and CI/CD for this project:
               - Dockerfile (multi-stage)
               - docker-compose.yml (app + db + redis)
               - GitHub Actions workflow
               - .env.example`,
      outputFormat: 'config'
    });
    results.push({ name: 'DevOps', output: devops });

    // ذخیره همه فایل‌ها در vault
    await this.saveToVault(spec.projectName, results);
    
    return { steps: results, projectPath: spec.projectName };
  }
}
```

### 🔧 ۶. Vault Integration — ذخیره خروجی‌ها در Obsidian

```typescript
// src/features/VaultIntegration.ts

export class VaultIntegration {
  
  /**
   * ذخیره خروجی workflow به صورت ساختاریافته در vault
   */
  async saveBackendProject(projectName: string, steps: WorkflowStep[]) {
    const basePath = `Projects/${projectName}`;
    
    // ایجاد ساختار پوشه
    await this.createFolder(`${basePath}`);
    await this.createFolder(`${basePath}/database`);
    await this.createFolder(`${basePath}/api`);
    await this.createFolder(`${basePath}/auth`);
    await this.createFolder(`${basePath}/tests`);
    await this.createFolder(`${basePath}/devops`);
    
    // ذخیره هر مرحله
    for (const step of steps) {
      // فایل مارکداون با توضیحات
      await this.createNote(
        `${basePath}/${step.name}.md`,
        this.formatStepAsMarkdown(step)
      );
      
      // فایل‌های کد خام (extracting code blocks)
      const codeBlocks = this.extractCodeBlocks(step.output);
      for (const block of codeBlocks) {
        await this.createNote(
          `${basePath}/${step.category}/${block.filename}`,
          block.content
        );
      }
    }
    
    // ایجاد README
    await this.createNote(
      `${basePath}/README.md`,
      this.generateReadme(projectName, steps)
    );
    
    // لینک‌های داخلی Obsidian
    await this.createNote(
      `${basePath}/index.md`,
      steps.map(s => `- [[${s.name}]]`).join('\n')
    );
  }

  /**
   * خواندن فایل‌های vault و ارسال به عنوان context
   */
  async getVaultContext(filePaths: string[]): Promise<string> {
    const contents = await Promise.all(
      filePaths.map(async (path) => {
        const content = await this.app.vault.read(
          this.app.vault.getAbstractFileByPath(path) as TFile
        );
        return `## File: ${path}\n\`\`\`\n${content}\n\`\`\``;
      })
    );
    return contents.join('\n\n');
  }
}
```

### 🔧 ۷. Provider Registry — ثبت آسان پروایدرها

```typescript
// src/providers/registry.ts
// نکته کلیدی: تقریباً همه OpenAI-compatible هستن!

export const PROVIDER_REGISTRY: ProviderDefinition[] = [
  {
    id: 'groq',
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    type: 'openai-compatible',
    free: true,
    creditCard: false,
    signupUrl: 'https://console.groq.com',
    defaultModels: [
      'llama-3.3-70b-versatile',
      'llama-3.1-8b-instant',
      'llama-4-scout-17b-16e-instruct',
      'qwen-qwq-32b',
    ],
    rateLimits: { rpm: 30, rpd: 1000, tpm: 12000 },
    bestFor: ['speed', 'chat', 'quick-tasks']
  },
  {
    id: 'cerebras',
    name: 'Cerebras',
    baseUrl: 'https://api.cerebras.ai/v1',
    type: 'openai-compatible',
    free: true,
    creditCard: false,
    signupUrl: 'https://cloud.cerebras.ai',
    defaultModels: [
      'llama3.1-8b',
      'gpt-oss-120b',
    ],
    rateLimits: { rpm: 30, tpd: 1000000 },
    bestFor: ['high-volume', 'large-context']
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    type: 'openai-compatible',
    free: true,  // free tier
    creditCard: false,
    signupUrl: 'https://platform.deepseek.com',
    defaultModels: [
      'deepseek-chat',    // V3.2
      'deepseek-reasoner' // R1
    ],
    bestFor: ['coding', 'reasoning', 'backend']
  },
  {
    id: 'sambanova',
    name: 'SambaNova',
    baseUrl: 'https://api.sambanova.ai/v1',
    type: 'openai-compatible',
    free: true,  // $5 free credits
    creditCard: false,
    signupUrl: 'https://cloud.sambanova.ai',
    defaultModels: [
      'Llama-4-Maverick-17B-128E-Instruct',
      'DeepSeek-V3.1-Terminus',
      'Qwen3-235B',
    ],
    bestFor: ['speed', 'large-models']
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    type: 'openai-compatible',
    free: true,
    creditCard: false,
    signupUrl: 'https://openrouter.ai',
    defaultModels: ['auto'], // 20+ free models
    rateLimits: { rpm: 20, rpd: 50 },
    bestFor: ['variety', 'fallback', 'model-comparison']
  },
  {
    id: 'google',
    name: 'Google AI Studio',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    type: 'google-genai',  // متفاوت — نیاز به adapter
    free: true,
    creditCard: false,
    signupUrl: 'https://aistudio.google.com',
    defaultModels: [
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
    ],
    bestFor: ['long-context', 'multimodal', '1M-tokens']
  },
  {
    id: 'huggingface',
    name: 'HuggingFace',
    baseUrl: 'https://api-inference.huggingface.co/v1',
    type: 'openai-compatible',
    free: true,
    creditCard: false,
    signupUrl: 'https://huggingface.co',
    defaultModels: [], // dynamic — pulls from HF Hub
    bestFor: ['variety', 'open-source', 'niche-models']
  },
  {
    id: 'github-models',
    name: 'GitHub Models',
    baseUrl: 'https://models.inference.ai.azure.com',
    type: 'openai-compatible',
    free: true,
    creditCard: false,
    signupUrl: 'https://github.com/marketplace/models',
    defaultModels: [
      'gpt-4o-mini',
      'Meta-Llama-3.1-70B-Instruct',
    ],
    bestFor: ['prototyping', 'github-users']
  },
  {
    id: 'fireworks',
    name: 'Fireworks AI',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    type: 'openai-compatible',
    free: true,  // $1 initial credit
    creditCard: true,
    signupUrl: 'https://fireworks.ai',
    defaultModels: [
      'accounts/fireworks/models/llama-v3p3-70b-instruct',
      'accounts/fireworks/models/deepseek-v3',
    ],
    bestFor: ['speed', 'image-gen', 'fine-tuned-models']
  },
  {
    id: 'nvidia-nim',
    name: 'NVIDIA NIM',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    type: 'openai-compatible',
    free: true,
    creditCard: false,
    signupUrl: 'https://build.nvidia.com',
    defaultModels: [
      'meta/llama-3.3-70b-instruct',
      'deepseek-ai/deepseek-r1',
    ],
    bestFor: ['evaluation', 'nvidia-ecosystem']
  },
];
```

---

## مقایسه نهایی: پلاگین ما vs Google AI Studio

| قابلیت | Google AI Studio Build | 🔥 AI Forge (پلاگین ما) |
|---|---|---|
| **فرانت‌اند** | ✅ عالی (HTML/CSS/JS live) | ⚠️ کد تولید می‌کنه ولی preview نداره |
| **بکند کد** | ⚠️ محدود | ✅ System prompts تخصصی بکند |
| **دیتابیس** | ❌ | ✅ Schema design + migrations |
| **Auth سیستم** | ❌ | ✅ JWT/OAuth/RBAC templates |
| **Docker/DevOps** | ❌ | ✅ Dockerfile, CI/CD, K8s |
| **تست‌نویسی** | ❌ | ✅ Unit/Integration/E2E |
| **Multi-provider** | ❌ فقط Gemini | ✅ ۱۲+ پروایدر رایگان |
| **Smart routing** | ❌ | ✅ مدل درست برای تسک درست |
| **Failover** | ❌ | ✅ خودکار بره بعدی وقتی rate limit |
| **فایل‌های پروژه** | ❌ | ✅ Context injection از vault |
| **ذخیره خروجی** | ⚠️ محدود | ✅ ساختاریافته در vault |
| **مقایسه مدل‌ها** | ❌ | ✅ Split view |
| **آفلاین** | ❌ | ✅ با Obsidian offline + تاریخچه |
| **دیپلوی** | ✅ Cloud Run | ❌ (ولی کد آماده دیپلوی تولید می‌کنه) |
| **Android** | ✅ | ✅ |
| **هزینه** | رایگان (محدود) | رایگان (stack چند پروایدر) |

---

## نقشه راه نهایی

```
فاز ۱ — Core Engine (هفته ۱-۲)
├── OpenAI-compatible provider base class
├── ثبت ۴ پروایدر: Groq, DeepSeek, Cerebras, OpenRouter
├── Chat view با streaming
├── System prompt editor
└── تنظیمات (temperature, tokens, etc.)

فاز ۲ — Backend Power (هفته ۳-۴)
├── Backend template library (6+ template)
├── Project context injection (vault files)
├── Smart model router
├── Provider stacking + failover
└── خروجی ساختاریافته در vault

فاز ۳ — Full Provider Coverage (هفته ۵-۶)
├── SambaNova, HuggingFace, Fireworks, NVIDIA, GitHub
├── Google Gemini adapter (non-OpenAI format)
├── Model comparison (split view)
├── Usage dashboard (rate limit tracker)
└── بهینه‌سازی Android

فاز ۴ — Advanced (هفته ۷+)
├── Backend workflow builder (multi-step)
├── RAG با یادداشت‌های vault
├── Prompt gallery با community sharing
├── Export to project directory
└── انتشار Community Plugin
```

---

**خلاصه:** تو داری یه چیزی می‌سازی که Google AI Studio **نمی‌تونه** بده: یه ابزار AI واقعی برای بکند دولوپرها، با دسترسی به ۱۲+ پروایدر رایگان، smart routing بین مدل‌ها، و یکپارچگی عمیق با فایل‌سیستم Obsidian. 

بزن بسازش! 🔥 اگه سؤالی داری در هر مرحله بگو.