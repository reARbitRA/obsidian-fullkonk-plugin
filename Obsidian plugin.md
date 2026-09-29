

سیستم پلاگین‌های کامیونیتی Obsidian به توسعه‌دهندگان اجازه می‌دهد عملکرد نرم‌افزار را از طریق Plugin API گسترش دهند. این API دسترسی به عملیات فایل‌سیستم vault (خواندن، نوشتن، حذف) و موارد دیگر را فراهم می‌کند.

پلاگین‌ها می‌توانند از Obsidian API با `require('obsidian')` و API‌های NodeJS/Electron با `require('fs')` یا `require('electron')` استفاده کنند. فیلد `isDesktopOnly` در manifest مشخص می‌کند که آیا پلاگین از API‌های NodeJS یا Electron استفاده می‌کند.

هیچ سیستم مجوز دقیقی برای محدود کردن قابلیت‌های هر پلاگین وجود ندارد — یعنی عملاً دست شما برای ساخت هر رابط کاربری و ارسال هر درخواست HTTP باز است.

---

## ۲. پلاگین‌های مشابه موجود (الهام‌بخش)

### 🔹 LLM Hub
از هر پروایدر LLM پشتیبانی می‌کند: Gemini، OpenAI، Anthropic، OpenRouter، Grok و LLM‌های محلی (Ollama, LM Studio, vLLM). شامل چت چند-پروایدری، عملیات Vault، سازنده Workflow با ویرایشگر بصری نود و ۲۵ نوع نود، جستجوی وب، تولید تصویر و موارد دیگر است.

### 🔹 Text Generator
یک پلاگین همه‌کاره برای Obsidian که امکان تولید محتوای متنی با استفاده از پروایدرهای مختلف AI از جمله OpenAI، Anthropic، Google و مدل‌های محلی را فراهم می‌کند.

### 🔹 YOLO Plugin
پلاگین YOLO قابلیت‌های جامع AI را از طریق حالت‌های تعامل مختلف ارائه می‌دهد. چت با مدل‌ها در سایدبار، تولید محتوا در یادداشت‌ها، کمک آنلاین و تکمیل خودکار با AI. از چندین پروایدر از جمله OpenAI، Claude، Gemini، DeepSeek و Groq پشتیبانی می‌کند.

### 🔹 BMO Chatbot
پلاگین BMO Chatbot تعامل هوش مصنوعی را به Obsidian می‌آورد. از چندین مدل LLM از پروایدرهایی مثل OpenAI، Anthropic و API‌های خود-میزبان مانند Ollama و LM Studio پشتیبانی می‌کند. پروفایل‌های قابل سفارشی‌سازی برای چت‌بات‌ها با دانش و شخصیت‌های منحصربفرد ارائه می‌دهد.

---

## ۳. معماری پیشنهادی پلاگین شما

```
┌─────────────────────────────────────────────────┐
│              Obsidian Plugin (UI Layer)           │
│  ┌───────────────────────────────────────────┐   │
│  │         AI Studio-like Interface          │   │
│  │  ┌─────────┐ ┌──────────┐ ┌───────────┐  │   │
│  │  │ System  │ │  Chat    │ │ Settings  │  │   │
│  │  │ Prompt  │ │  Panel   │ │ & Config  │  │   │
│  │  └─────────┘ └──────────┘ └───────────┘  │   │
│  └───────────────────────────────────────────┘   │
│                                                   │
│  ┌───────────────────────────────────────────┐   │
│  │        Provider Abstraction Layer          │   │
│  │                                           │   │
│  │  interface LLMProvider {                  │   │
│  │    chat(messages, config): Stream         │   │
│  │    listModels(): Model[]                  │   │
│  │  }                                        │   │
│  └───────────────────────────────────────────┘   │
│                                                   │
│  ┌───┐ ┌───┐ ┌──┐ ┌────┐ ┌────┐ ┌─────┐ ┌───┐  │
│  │Groq│ │Grok│ │HF│ │Sam-│ │Deep│ │Fire-│ │...│  │
│  │   │ │   │ │  │ │ba- │ │Seek│ │works│ │   │  │
│  │   │ │   │ │  │ │Nova│ │    │ │     │ │   │  │
│  └───┘ └───┘ └──┘ └────┘ └────┘ └─────┘ └───┘  │
└─────────────────────────────────────────────────┘
```

### فایل‌ساختار پروژه:
```
obsidian-ai-studio/
├── manifest.json
├── main.ts                    # Entry point
├── src/
│   ├── providers/
│   │   ├── base.ts           # Abstract LLMProvider interface
│   │   ├── groq.ts           # Groq implementation
│   │   ├── grok.ts           # xAI/Grok implementation
│   │   ├── huggingface.ts    # HuggingFace Inference API
│   │   ├── sambanova.ts      # SambaNova Cloud
│   │   ├── deepseek.ts       # DeepSeek API
│   │   ├── fireworks.ts      # Fireworks AI
│   │   └── openrouter.ts     # OpenRouter (دسترسی به همه مدل‌ها)
│   ├── ui/
│   │   ├── ChatView.ts       # Main chat panel
│   │   ├── SystemPrompt.ts   # System prompt editor
│   │   ├── ModelSelector.ts  # Model/Provider picker
│   │   ├── SettingsTab.ts    # Plugin settings
│   │   └── StreamRenderer.ts # Streaming response renderer
│   ├── utils/
│   │   ├── streaming.ts      # SSE/streaming handler
│   │   └── tokenCounter.ts   # Token estimation
│   └── types.ts
├── styles.css
└── package.json
```

---

## ۴. کد نمونه — لایه انتزاعی پروایدرها

```typescript
// src/providers/base.ts
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ModelConfig {
  temperature: number;
  maxTokens: number;
  topP: number;
  topK?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stop?: string[];
}

export interface LLMProvider {
  name: string;
  getModels(): Promise<string[]>;
  chat(
    messages: ChatMessage[],
    model: string,
    config: ModelConfig,
    onChunk: (chunk: string) => void,    // streaming callback
    signal?: AbortSignal
  ): Promise<string>;
}
```

```typescript
// src/providers/groq.ts
import { LLMProvider, ChatMessage, ModelConfig } from './base';
import { requestUrl } from 'obsidian';

export class GroqProvider implements LLMProvider {
  name = 'Groq';

  constructor(private apiKey: string) {}

  async getModels(): Promise<string[]> {
    const res = await requestUrl({
      url: 'https://api.groq.com/openai/v1/models',
      headers: { 'Authorization': `Bearer ${this.apiKey}` }
    });
    return res.json.data.map((m: any) => m.id);
  }

  async chat(
    messages: ChatMessage[],
    model: string,
    config: ModelConfig,
    onChunk: (chunk: string) => void,
    signal?: AbortSignal
  ): Promise<string> {
    // Using fetch for streaming (SSE)
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: config.temperature,
        max_tokens: config.maxTokens,
        top_p: config.topP,
        stream: true
      }),
      signal
    });

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let fullText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(l => l.startsWith('data: '));
      for (const line of lines) {
        const data = line.replace('data: ', '');
        if (data === '[DONE]') continue;
        const parsed = JSON.parse(data);
        const content = parsed.choices[0]?.delta?.content || '';
        fullText += content;
        onChunk(content);
      }
    }
    return fullText;
  }
}
```

```typescript
// نکته کلیدی: بیشتر این پروایدرها OpenAI-compatible هستن!
// پس می‌تونی یک پروایدر عمومی بسازی:

export class OpenAICompatibleProvider implements LLMProvider {
  constructor(
    public name: string,
    private apiKey: string,
    private baseUrl: string  // هر پروایدر فقط baseUrl فرق داره
  ) {}
  // ... بقیه کد تقریباً یکسانه
}

// استفاده:
const groq    = new OpenAICompatibleProvider('Groq',     key, 'https://api.groq.com/openai/v1');
const deepseek= new OpenAICompatibleProvider('DeepSeek', key, 'https://api.deepseek.com/v1');
const fireworks=new OpenAICompatibleProvider('Fireworks',key, 'https://api.fireworks.ai/inference/v1');
const sambanova=new OpenAICompatibleProvider('SambaNova',key, 'https://api.sambanova.ai/v1');
```

---

## ۵. قابلیت‌هایی شبیه Google AI Studio

| قابلیت Google AI Studio | پیاده‌سازی در پلاگین |
|---|---|
| System Prompt Editor | یک TextArea بالای چت |
| Temperature / Top-P / Top-K sliders | تنظیمات با `<input type="range">` |
| Streaming Response | SSE parsing + incremental DOM update |
| Multi-turn Chat | آرایه messages ذخیره در state |
| Model Selector | Dropdown با لیست مدل‌ها از API |
| Structured Output (JSON mode) | `response_format: { type: "json_object" }` |
| Token Counter | `tiktoken` یا تخمین ساده |
| Chat History | ذخیره در vault به صورت JSON/Markdown |
| Compare Models | Split view با دو چت همزمان |
| Prompt Gallery / Templates | فایل‌های Markdown در یک پوشه خاص |

---

## ۶. موضوع Android / موبایل ⚠️

فیلد `isDesktopOnly` در manifest مشخص می‌کند آیا پلاگین از API‌های NodeJS یا Electron استفاده می‌کند یا خیر.

سازگاری پلاگین‌ها با موبایل محدود است: تقریباً ۳۰٪ از پلاگین‌های دسکتاپ پیاده‌سازی سازگار با موبایل ندارند.

پلاگین‌های Obsidian درون اپلیکیشن اجرا می‌شوند و به آنچه Plugin API ارائه می‌دهد محدودند و عمداً شامل یکپارچگی عمیق سیستمی نمی‌شوند. قابلیت‌هایی مثل ویجت‌های صفحه اصلی، نوتیفیکیشن‌های زمان‌بندی‌شده و میانبرهای دستیار صوتی در سطح سیستم‌عامل قرار دارند.

### ✅ برای موبایل مشکلی نداری اگر:
- از `isDesktopOnly: false` در manifest استفاده کنی
- از `require('fs')` یا `require('electron')` استفاده **نکنی**
- بجاش از **`requestUrl`** (API خود Obsidian) یا **`fetch`** برای درخواست‌های HTTP استفاده کنی
- رابط کاربری را **responsive** طراحی کنی

```json
// manifest.json
{
  "id": "ai-studio",
  "name": "AI Studio",
  "version": "1.0.0",
  "minAppVersion": "1.0.0",
  "isDesktopOnly": false,    // ← کلید اصلی!
  "author": "Your Name",
  "description": "Google AI Studio-like environment inside Obsidian"
}
```

---

## ۷. نقشه راه پیشنهادی

```
فاز ۱ — MVP (هفته ۱-۲)
├── یک پروایدر (مثلاً Groq)
├── چت ساده با streaming
├── System prompt
└── تنظیمات temperature/max_tokens

فاز ۲ — Multi-Provider (هفته ۳-۴)
├── لایه انتزاعی OpenAI-compatible
├── اضافه کردن DeepSeek, Fireworks, SambaNova, Grok
├── HuggingFace Inference API (متفاوت‌تره)
└── Model selector dropdown

فاز ۳ — پیشرفته (هفته ۵-۶)
├── ذخیره تاریخچه چت در vault
├── Prompt templates
├── مقایسه مدل‌ها (split view)
├── JSON mode / Structured output
└── بهینه‌سازی UI برای Android

فاز ۴ — حرفه‌ای (هفته ۷+)
├── RAG با یادداشت‌های vault
├── Function calling
├── OpenRouter integration (دسترسی به +۲۰۰ مدل)
└── انتشار در Community Plugins
```

---


## جمع‌بندی

| سؤال                    | جواب                                                                     |
| ----------------------- | ------------------------------------------------------------------------ |
| امکان‌پذیره؟            | ✅ کاملاً بله                                                             |
| روی PC کار می‌کنه؟      | ✅ بدون محدودیت                                                           |
| روی Android کار می‌کنه؟ | ✅ اگر از `isDesktopOnly: false` استفاده کنی و از NodeJS API استفاده نکنی |
| پروایدرهای مختلف؟       | ✅ بیشترشون OpenAI-compatible هستن، پیاده‌سازی خیلی ساده‌ست               |
| پلاگین مشابه وجود داره؟ | ✅ بله ولی هیچ‌کدوم دقیقاً تجربه AI Studio رو ارائه نمی‌دن                |

