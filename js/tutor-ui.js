import { tutorController } from './tutor-core.js';
import { sendHomeworkRequest } from './api-service.js';
import {
    updateChatList,
    updateChatDisplay,
    updateUIState,
    showProcessingState,
    hideProcessingState,
    updateSoundLevelDisplay,
    updatePlaybackSpeed,
    updatePauseTime,
    updateInfoWindow,
    highlightSelectedChat,
    deleteLocalHistory,
    deleteSelectedChat,
    populateMicrophoneSelect,
    populateLanguageSelects,
    initializeUI
} from './tutor-ui-helpers.js';

// DOM element references
// DOM element references
const elements = {
    startTutorButton: document.getElementById('startTutorButton'),
    stopTutorButton: document.getElementById('stopTutorButton'),
    sendButton: document.getElementById('sendButton'),
    createChatButton: document.getElementById('createChatButton'),
    statusDisplay: document.getElementById('statusDisplay'),
    microphoneSelect: document.getElementById('microphoneSelect'),
    playbackSpeedSlider: document.getElementById('playbackSpeedSlider'),
    pauseTimeSlider: document.getElementById('pauseTimeSlider'),
    tutoringLanguageSelect: document.getElementById('tutoringLanguageSelect'),
    tutorsLanguageSelect: document.getElementById('tutorsLanguageSelect'),
    interventionLevelSelect: document.getElementById('interventionLevelSelect'),
    tutorsVoiceSelect: document.getElementById('tutorsVoiceSelect'),
    partnersVoiceSelect: document.getElementById('partnersVoiceSelect'),
    disableTutorCheckbox: document.getElementById('disableTutorCheckbox'),
    accentIgnoreCheckbox: document.getElementById('accentIgnoreCheckbox'),
    modelSelect: document.getElementById('modelSelect'),
    deleteLocalHistoryButton: document.getElementById('deleteLocalHistoryButton'),
    deleteSelectedChatButton: document.getElementById('deleteSelectedChatButton'),
    giveHomeworkButton: document.getElementById('giveHomeworkButton'),
    downloadHomeworkButton: document.getElementById('downloadHomeworkButton'),
    homeworkTextarea: document.getElementById('homeworkTextarea')
};

// Event listeners
elements.startTutorButton.addEventListener('click', () => {
    console.log('Start button clicked');
    tutorController.start();
    updateUIState(true);
});

elements.stopTutorButton.addEventListener('click', async () => {
    try {
        await tutorController.stop();
        updateUIState(false);
        elements.statusDisplay.textContent = "Stopped";
    } catch (error) {
        console.error("Error stopping tutor:", error);
        elements.statusDisplay.textContent = "Error: Failed to stop tutor";
    }
});

elements.sendButton.addEventListener('click', () => {
    if (tutorController.isActive) {
        tutorController.manualStop();
        elements.sendButton.disabled = true;
        showProcessingState();
    }
});

elements.createChatButton.addEventListener('click', async () => {
    const newChat = await tutorController.createNewChat();
    if (newChat !== null) {
        await updateChatList();
        updateChatDisplay(newChat);
    }
});

elements.playbackSpeedSlider.addEventListener('input', updatePlaybackSpeed);
elements.pauseTimeSlider.addEventListener('input', updatePauseTime);
elements.tutoringLanguageSelect.addEventListener('change', () => tutorController.setTutoringLanguage(elements.tutoringLanguageSelect.value));
elements.tutorsLanguageSelect.addEventListener('change', () => tutorController.updateTutorsLanguage(elements.tutorsLanguageSelect.value));
elements.interventionLevelSelect.addEventListener('change', () => tutorController.updateInterventionLevel(elements.interventionLevelSelect.value));
elements.tutorsVoiceSelect.addEventListener('change', () => tutorController.updateTutorsVoice(elements.tutorsVoiceSelect.value));
elements.partnersVoiceSelect.addEventListener('change', () => tutorController.updatePartnersVoice(elements.partnersVoiceSelect.value));
elements.microphoneSelect.addEventListener('change', () => tutorController.setMicrophone(elements.microphoneSelect.value));
elements.disableTutorCheckbox.addEventListener('change', () => tutorController.setDisableTutor(elements.disableTutorCheckbox.checked));
elements.accentIgnoreCheckbox.addEventListener('change', () => tutorController.setAccentIgnore(elements.accentIgnoreCheckbox.checked));
elements.modelSelect.addEventListener('change', () => tutorController.updateModel(elements.modelSelect.value));
elements.deleteLocalHistoryButton.addEventListener('click', deleteLocalHistory);
elements.deleteSelectedChatButton.addEventListener('click', deleteSelectedChat);

elements.giveHomeworkButton.addEventListener('click', async () => {
    try {
        showProcessingState();
        const currentChat = tutorController.getCurrentChat();
        const formElements = {
            tutoringLanguageSelect: elements.tutoringLanguageSelect,
            tutorsLanguageSelect: elements.tutorsLanguageSelect,
            tutorsVoiceSelect: elements.tutorsVoiceSelect,
            partnersVoiceSelect: elements.partnersVoiceSelect,
            interventionLevelSelect: elements.interventionLevelSelect,
            chatObject: currentChat,
            disableTutorCheckbox: elements.disableTutorCheckbox,
            accentIgnoreCheckbox: elements.accentIgnoreCheckbox,
            modelSelect: elements.modelSelect,
            playbackSpeedSlider: elements.playbackSpeedSlider,
            pauseTimeSlider: elements.pauseTimeSlider
        };
        const homework = await sendHomeworkRequest(formElements);
        elements.homeworkTextarea.value = homework;
    } catch (error) {
        console.error("Error generating homework:", error);
        updateInfoWindow("Error generating homework: " + error.message);
    } finally {
        hideProcessingState();
    }
});

elements.downloadHomeworkButton.addEventListener('click', () => {
    const homework = elements.homeworkTextarea.value;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    const splitText = doc.splitTextToSize(homework, 180);
    doc.text(splitText, 15, 15);
    
    doc.save('homework.pdf');
});

// Initialize UI
initializeUI();

// Start monitoring interval
const monitoringInterval = tutorController.startMonitoringInterval();

// Clean up before page unload
window.addEventListener('beforeunload', (event) => {
    clearInterval(monitoringInterval);
    // Optionally, you can show a confirmation dialog
    // event.preventDefault(); // Cancel the event
    // event.returnValue = ''; // Show a generic message in some browsers
});
