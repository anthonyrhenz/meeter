# 🎤 meeter [WIP]

organism live - mirai helps you manage your knowledge

## 🌐 Project Overview

This project uses gpt-oss-[20/120]b for performing realtime intelligent decision making in functional environments using a combination of ultra low latency inference and an AI-driven architecture.

## 🏆 Submission Categories

> 🏁 Best Overall ;)
> 🏁 Weirdest Hardware
> 🏁 Most Useful Fine-Tune

Built with gpt-oss-20b and gpt-oss-120b weights from [Hugging Face](https://huggingface.co/openai/gpt-oss-120b) running on [groq](https://groq.com/)'s LPU hardware. Fine tuned with data-set from [TBD]. WIP!

## 📹 Demo Video Link

⏯️ **[Youtube Link](https://www.youtube.com/@anthonyrhenz)**

## 💡 Instructions

Start the app, press the buttons, do the thing. WIP!

## 🚀 Deployment

Create a copy of `.env.example` and fill it with the required environment variables.

```bash
git clone https://github.com/anthonyrhenz/meeter.git
cp .env.example .env
docker compose up --build
```

We'll eventually set up a sample knowledgebase and test database

## 🏗️ Development

Same as above, but ensure your environment is set up with debug enabled, and hot reload is on.

## 🧠 Useful Commands

```bash
docker compose up --build -V # clears the frontend volume for a full rebuild
docker compose up --build -d # frees up your terminal
```

## ⚖️ Licensing and Usage

All rights reserved. This project is proprietary and may not be used, modified, distributed, or reproduced without explicit permission from the author, except for testing, evaluation, and use by OpenAI sponsors, administrators, and judges as per hackathon rules. gpt-oss components comply with Apache 2.0 - see /licenses for details.
