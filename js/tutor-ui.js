import { tutorController } from './tutor-core.js';
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
const startTutorButton = document.getElementById('startTutorButton');
const stopTutorButton = document.getElementById('stopTutorButton');
const sendButton = document.getElementById('sendButton');
const createChatButton = document.getElementById('createChatButton');
const statusDisplay = document.getElementById('statusDisplay');
const microphoneSelect = document.getElementById('microphoneSelect');
const playbackSpeedSlider = document.getElementById('playbackSpeedSlider');
const pauseTimeSlider = document.getElementById('pauseTimeSlider');
const tutoringLanguageSelect = document.getElementById('tutoringLanguageSelect');
const tutorsLanguageSelect = document.getElementById('tutorsLanguageSelect');
const interventionLevelSelect = document.getElementById('interventionLevelSelect');
const tutorsVoiceSelect = document.getElementById('tutorsVoiceSelect');
const partnersVoiceSelect = document.getElementById('partnersVoiceSelect');
const disableTutorCheckbox = document.getElementById('disableTutorCheckbox');
const accentIgnoreCheckbox = document.getElementById('accentIgnoreCheckbox');
const modelSelect = document.getElementById('modelSelect');
const deleteLocalHistoryButton = document.getElementById('deleteLocalHistoryButton');
const deleteSelectedChatButton = document.getElementById('deleteSelectedChatButton');
const giveHomeworkButton = document.getElementById('giveHomeworkButton');
const downloadHomeworkButton = document.getElementById('downloadHomeworkButton');
const homeworkTextarea = document.getElementById('homeworkTextarea');

// Event listeners
startTutorButton.addEventListener('click', () => {
    console.log('Start button clicked');
    tutorController.start();
    updateUIState(true);
});

stopTutorButton.addEventListener('click', async () => {
    try {
        await tutorController.stop();
        updateUIState(false);
        statusDisplay.textContent = "Stopped";
    } catch (error) {
        console.error("Error stopping tutor:", error);
        statusDisplay.textContent = "Error: Failed to stop tutor";
    }
});

sendButton.addEventListener('click', () => {
    if (tutorController.isActive) {
        tutorController.manualStop();
        sendButton.disabled = true;
        showProcessingState();
    }
});

createChatButton.addEventListener('click', async () => {
    const newChat = await tutorController.createNewChat();
    if (newChat !== null) {
        await updateChatList();
        updateChatDisplay(newChat);
    }
});

playbackSpeedSlider.addEventListener('input', updatePlaybackSpeed);
pauseTimeSlider.addEventListener('input', updatePauseTime);
tutoringLanguageSelect.addEventListener('change', () => tutorController.setTutoringLanguage(tutoringLanguageSelect.value));
tutorsLanguageSelect.addEventListener('change', () => tutorController.updateTutorsLanguage(tutorsLanguageSelect.value));
interventionLevelSelect.addEventListener('change', () => tutorController.updateInterventionLevel(interventionLevelSelect.value));
tutorsVoiceSelect.addEventListener('change', () => tutorController.updateTutorsVoice(tutorsVoiceSelect.value));
partnersVoiceSelect.addEventListener('change', () => tutorController.updatePartnersVoice(partnersVoiceSelect.value));
microphoneSelect.addEventListener('change', () => tutorController.setMicrophone(microphoneSelect.value));
disableTutorCheckbox.addEventListener('change', () => tutorController.setDisableTutor(disableTutorCheckbox.checked));
accentIgnoreCheckbox.addEventListener('change', () => tutorController.setAccentIgnore(accentIgnoreCheckbox.checked));
modelSelect.addEventListener('change', () => tutorController.updateModel(modelSelect.value));
deleteLocalHistoryButton.addEventListener('click', deleteLocalHistory);
deleteSelectedChatButton.addEventListener('click', deleteSelectedChat);

giveHomeworkButton.addEventListener('click', () => {
    // TODO: Implement homework generation logic
    homeworkTextarea.value = "Your homework assignment goes here...";
});

downloadHomeworkButton.addEventListener('click', () => {
    const homework = homeworkTextarea.value;
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

// Clean up on page unload
window.addEventListener('unload', () => {
    clearInterval(monitoringInterval);
});
