# Live Audio Translator 🌍🎙️

A real-time, bidirectional audio interpreter powered by the **Gemini 2.5 Live API**. This application allows two people speaking different languages to have a fluid conversation.

## ✨ Features

- **Real-time Translation**: Instant bidirectional translation between dozens of languages.
- **Voice Selection**: Choose between a "Girl" (Feminine) or "Boy" (Masculine) voice for each participant.
- **Trigger Word Activation**: The app listens passively and only translates when you say the magic word: **"Translate"** (or "Traduire", "Traducir", etc.).
- **Live Transcription**: Visual bubbles showing both the original speech and the translation.
- **Audio Visualizer**: Real-time feedback of your microphone input.
- **Clean UI**: Dark-themed, responsive interface built with React and Tailwind CSS.

## 🚀 How to Use

1. **Select Languages**: Choose the two languages for the conversation.
2. **Select Voices**: Assign a preferred voice gender to each participant.
3. **Connect**: Click the microphone button to start the session.
4. **Speak**: Speak naturally in either language.
5. **Trigger**: When you want to translate your last thought, simply say **"Translate"**.
6. **Wait**: The AI will detect the pause and speak the translation in the target language.

## 🛠️ Setup & Security

This project is built using **ES Modules** and imports libraries directly via `esm.sh`.

### Environment Variables

The app requires a Google Gemini API Key. It is accessed via `process.env.API_KEY`.

**⚠️ Important Security Note:**
Never hardcode your API key in the code. If you deploy this on **Vercel**, **Netlify**, or **Cloudflare Pages**, add your `API_KEY` in the "Environment Variables" section of your deployment dashboard.

## 📦 Deployment

You can deploy this folder directly to any static hosting provider. Since it's a client-side React app using ESM, no complex build step is required for basic hosting.

---

*Built with ❤️ using Google Gemini.*
