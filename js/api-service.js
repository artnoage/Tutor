async function sendAudioToServer(audioBlob, formElements) {
    const audioData = {
        motherTongue: formElements.motherTongueSelect.value,
        tutoringLanguage: formElements.tutoringLanguageSelect.value,
        tutorsLanguage: formElements.tutorsLanguageSelect.value,
        tutorsVoice: formElements.tutorsVoiceSelect.value,
        partnersVoice: formElements.partnersVoiceSelect.value,
        interventionLevel: formElements.interventionLevelSelect.value,
        chatObject: formElements.chatObject
    };

    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.wav');
    formData.append('data', JSON.stringify(audioData));

    try {
        console.time('serverProcessing');
        //const response = await fetch('https://fastapi.metaskepsis.com/process_audio'
        const response = await fetch('https://tutorapi.metaskepsis.com/process_audio'
        //const response = await fetch('http://127.0.0.1:8000/process_audio'
            
            , {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        console.timeEnd('serverProcessing');
        return {
            chat_history: result.chat_history,
            audio_base64: result.audio_base64,
            chatObject: result.chatObject,
            tutors_feedback: result.tutors_feedback,
            updated_summary: result.updated_summary
        };
    } catch (error) {
        console.error('Error sending audio to server:', error);
        throw error;
    }
}

export { sendAudioToServer };