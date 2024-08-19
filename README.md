# Language Learning AI Tutor

## Project Overview

This project is an AI-powered language learning application that provides an interactive tutoring experience. It combines a Python-based backend with a JavaScript frontend to create a responsive and engaging platform for language learners.

## Features

- Real-time audio processing and transcription
- AI-powered language partner for conversation practice
- Intelligent tutoring system with adjustable intervention levels
- Dynamic conversation summarization
- Text-to-speech functionality for AI responses
- Customizable user interface for learning preferences
- Adjustable silence threshold for audio detection

## Technical Stack

### Backend (Python)

- FastAPI for the web framework
- LangChain for AI model integration (using Groq and OpenAI models)
- Pydantic for data validation
- dotenv for environment variable management

### Frontend (JavaScript)

- Vanilla JavaScript for core functionality
- Web Audio API for audio processing
- MediaRecorder API for audio recording
- Fetch API for server communication

## Setup and Installation

1. Clone the repository
2. Install backend dependencies:
   ```
   pip install fastapi pydantic python-dotenv langchain-groq langchain-openai
   ```
3. Set up environment variables in a `.env` file:
   ```
   GROQ_API_KEY=your_groq_api_key
   OPENAI_API_KEY=your_openai_api_key
   ```
4. Run the backend server:
   ```
   uvicorn main:app --host 0.0.0.0 --port 8000
   ```
5. Open `index.html` in a web browser to access the frontend

## Usage

1. Select your native language, tutoring language, and preferred settings
2. Adjust the silence threshold using the provided slider
3. Click "Start Tutor" to begin a session
4. Speak into your microphone to converse with the AI partner
5. The AI tutor will provide feedback based on your chosen intervention level
6. Review the conversation summary and tutor comments for learning insights

## Key Components

### Backend

- `main.py`: FastAPI application setup and main audio processing endpoint
- `agents.py`: AI agent implementations for partner chat, tutor feedback, and summarization
- `utils.py`: Utility functions for audio transcription and text-to-speech

### Frontend

- `tutor-ui.js`: User interface management and event handling
- `tutor-core.js`: Core functionality for audio recording, processing, and communication with the backend
- `api-service.js`: API communication service
- `audio-utils.js`: Audio processing utilities

## API Configuration

The frontend is configured to make API calls to the backend server. By default, it assumes the backend is running on the same machine. If you need to change this:

1. Open the `api-service.js` file
2. Locate the `sendAudioToServer` function
3. Find the line:
   ```javascript
   const response = await fetch('/process_audio', {
   ```
4. Replace `/process_audio` with the full URL of your backend server if it's hosted elsewhere, e.g., `https://your-backend-server.com/process_audio`

Ensure that your backend server is accessible from the frontend's location and that CORS is properly configured if they're on different domains.

## Customization

- Use the silence threshold slider in the UI to adjust audio detection sensitivity
- Modify the system prompts in `agents.py` to alter the behavior of the AI partner and tutor
- Customize the user interface in `index.html` and `tutor-ui.js` to match your desired look and feel

## Future Enhancements

- Implement user authentication and session management
- Add support for more languages and language pairs
- Integrate progress tracking and performance analytics
- Develop mobile applications for iOS and Android

## Contributing

Contributions are welcome! Please fork the repository and submit pull requests with any enhancements, bug fixes, or documentation improvements.

## License

[Insert your chosen license here]