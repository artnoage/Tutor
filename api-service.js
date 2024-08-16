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
        const response = await fetch('http://localhost:8000/process_audio', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        console.timeEnd('serverProcessing');
        return result;
    } catch (error) {
        console.error('Error sending audio to server:', error);
        throw error;
    }
}

export { sendAudioToServer };