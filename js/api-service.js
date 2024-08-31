async function sendAudioToServer(audioBlob, formElements) {
    const audioData = {
        tutoringLanguage: formElements.tutoringLanguageSelect.value,
        tutorsLanguage: formElements.tutorsLanguageSelect.value,
        tutorsVoice: formElements.tutorsVoiceSelect.value,
        partnersVoice: formElements.partnersVoiceSelect.value,
        interventionLevel: formElements.interventionLevelSelect.value,
        chatObject: formElements.chatObject,
        disableTutor: formElements.disableTutorCheckbox.checked,
        accentignore: formElements.accentIgnoreCheckbox.checked,
        model: formElements.modelSelect.value
    };

    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.wav');
    formData.append('data', JSON.stringify(audioData));
    
    // Add API keys to form data (sending empty strings if not available)
    // TODO: Implement proper API key management later
    formData.append('groq_api_key', '');
    formData.append('openai_api_key', '');

    try {
        console.time('serverProcessing');
        //const response = await fetch('https://fastapi.metaskepsis.com/process_audio'
        //const response = await fetch('https://tutorapi.metaskepsis.com/process_audio', {
        const response = await fetch('http://127.0.0.1:8080/process_audio', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        console.timeEnd('serverProcessing');
        return {
            audio_base64: result.audio_base64,
            chatObject: result.chatObject
        };
    } catch (error) {
        console.error('Error sending audio to server:', error);
        throw error;
    }
}

export { sendAudioToServer };
