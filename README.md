# 🤖 ArkAgents - AI Agent Platform

Create custom AI agents in seconds. Powered by Groq (Llama 3.3 70B).

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python 3.8+](https://img.shields.io/badge/python-3.8+-blue.svg)](https://www.python.org/downloads/)
[![React](https://img.shields.io/badge/react-%2320232a.svg?style=flat&logo=react&logoColor=%2361DAFB)](https://reactjs.org/)

## 📁 Repository Structure

This is a monorepo containing both backend and frontend:

```
arkagents/
├── arkagents-backend/     # FastAPI backend
│   ├── main.py
│   ├── requirements.txt
│   └── .env.example
├── arkagents-frontend/    # React frontend
│   ├── src/
│   ├── public/
│   └── package.json
└── README.md
```

## 🌟 Features

* **Custom AI Agents** - Create unlimited specialized agents
* **Real-time Chat** - Blazing fast responses (<2 seconds)
* **Conversation Memory** - Agents remember context
* **Multi-agent Support** - Switch between different agents
* **Beautiful UI** - Clean, modern chat interface
* **Free & Fast** - Powered by Groq's free tier

## 🚀 Quick Start

### Prerequisites

- Python 3.8 or higher
- Node.js 16 or higher
- Groq API key ([Get one free](https://console.groq.com))

### Backend Setup

```bash
cd arkagents-backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
# On Windows:
.\venv\Scripts\Activate
# On macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create .env file
cp .env.example .env
# Edit .env and add your GROQ_API_KEY

# Run server
python main.py
```

Backend will run on `http://localhost:8001`

### Frontend Setup

```bash
cd arkagents-frontend

# Install dependencies
npm install

# Start development server
npm start
```

Frontend will run on `http://localhost:3000`

## 🔑 Environment Variables

Create `.env` in `arkagents-backend/`:

```env
GROQ_API_KEY=your_groq_api_key_here
ARKMAIL_API_URL=https://arkmail-api.onrender.com
PORT=8001
```

**Get your free Groq API key:** https://console.groq.com

## 📖 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/agents/create` | Create new agent |
| GET | `/api/agents/list` | List all agents |
| GET | `/api/agents/{id}` | Get agent details |
| POST | `/api/agents/{id}/chat` | Chat with agent |
| DELETE | `/api/agents/{id}` | Delete agent |

## 🛠️ Tech Stack

### Backend
- **FastAPI** - Modern Python web framework
- **Groq** - Llama 3.3 70B inference
- **Python 3.8+**

### Frontend
- **React** - UI framework
- **Axios** - HTTP client
- **Modern CSS** - Responsive design

## 📊 Performance

- **Response time:** <2 seconds
- **Free tier:** 14,400 requests/day
- **Supports:** 100+ concurrent users
- **Model:** Llama 3.3 70B via Groq

## 🎯 Use Cases

- Customer support automation
- Content generation assistants
- Code review agents
- Data analysis helpers
- Personal productivity bots

## 🤝 Contributing

Part of **Ark Technologies** - Building AI-native business tools.

Contributions are welcome! Please feel free to submit a Pull Request.

## 📝 License

MIT License - see [LICENSE](LICENSE) file for details

## 🔗 Related Projects

- **[ArkMail](https://mail.arktechnologies.ai)** - Intelligent email management
- **[ArkCRM](https://arktechnologies.ai/dashboard)** - Customer relationship management
- **[Ark Technologies](https://arktechnologies.ai)** - Main website

## 🐛 Issues & Support

Found a bug or have a question? [Open an issue](https://github.com/piccassol/arkagents/issues)

---

**Built with ❤️ by the Ark Technologies team**
