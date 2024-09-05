import { tutorController } from './tutor-core.js';
import { sendHomeworkRequest } from './api-service.js';
import { saveSettings, loadSettings, checkAndUpdateVersion } from './settings-manager.js';
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
    homeworkChatDisplay: document.getElementById('homeworkChatDisplay'),
    settingsButton: document.getElementById('settingsButton'),
    settingsOverlay: document.getElementById('settingsOverlay'),
    closeSettingsButton: document.getElementById('closeSettingsButton')
};

// Event listeners
elements.settingsButton.addEventListener('click', () => {
    elements.settingsOverlay.classList.remove('hidden');
});

elements.closeSettingsButton.addEventListener('click', () => {
    elements.settingsOverlay.classList.add('hidden');
});

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

elements.playbackSpeedSlider.addEventListener('input', () => { updatePlaybackSpeed(); saveCurrentSettings(); });
elements.pauseTimeSlider.addEventListener('input', () => { updatePauseTime(); saveCurrentSettings(); });
elements.tutoringLanguageSelect.addEventListener('change', () => { tutorController.setTutoringLanguage(elements.tutoringLanguageSelect.value); saveCurrentSettings(); });
elements.tutorsLanguageSelect.addEventListener('change', () => { tutorController.updateTutorsLanguage(elements.tutorsLanguageSelect.value); saveCurrentSettings(); });
elements.interventionLevelSelect.addEventListener('change', () => { 
    tutorController.setInterventionLevel(elements.interventionLevelSelect.value); 
    saveCurrentSettings(); 
});
elements.tutorsVoiceSelect.addEventListener('change', () => { 
    tutorController.updateTutorsVoice(elements.tutorsVoiceSelect.value); 
    saveCurrentSettings(); 
});
elements.partnersVoiceSelect.addEventListener('change', () => { 
    tutorController.updatePartnersVoice(elements.partnersVoiceSelect.value); 
    saveCurrentSettings(); 
});
elements.microphoneSelect.addEventListener('change', () => tutorController.setMicrophone(elements.microphoneSelect.value));
elements.disableTutorCheckbox.addEventListener('change', () => { 
    tutorController.setDisableTutor(elements.disableTutorCheckbox.checked); 
    saveCurrentSettings(); 
});
elements.accentIgnoreCheckbox.addEventListener('change', () => { 
    tutorController.setAccentIgnore(elements.accentIgnoreCheckbox.checked); 
    saveCurrentSettings(); 
});
elements.modelSelect.addEventListener('change', () => { 
    tutorController.updateModel(elements.modelSelect.value); 
    saveCurrentSettings(); 
});
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
        addMessageToHomeworkChat('Tutor', homework);
    } catch (error) {
        console.error("Error generating homework:", error);
        updateInfoWindow("Error generating homework: " + error.message);
    } finally {
        hideProcessingState();
    }
});

elements.downloadHomeworkButton.addEventListener('click', () => {
    const homeworkChat = elements.homeworkChatDisplay.innerText;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    const splitText = doc.splitTextToSize(homeworkChat, 180);
    doc.text(splitText, 15, 15);
    
    doc.save('homework_chat.pdf');
});

function addMessageToHomeworkChat(sender, message) {
    const messageElement = document.createElement('p');
    messageElement.innerHTML = `<strong>${sender}:</strong> ${message}`;
    elements.homeworkChatDisplay.appendChild(messageElement);
    elements.homeworkChatDisplay.scrollTop = elements.homeworkChatDisplay.scrollHeight;
}

// Check version and initialize
checkAndUpdateVersion().then((versionChanged) => {
    if (versionChanged) {
        // If version changed, we've already cleared the data
        console.log("New version detected. All data has been cleared.");
        updateInfoWindow("New version detected. All data has been cleared.");
    }
    
    // Initialize UI
    initializeUI();

    // Load saved settings
    loadSavedSettings();

    // Start monitoring interval
    const monitoringInterval = tutorController.startMonitoringInterval();
});

// Function to load saved settings
function loadSavedSettings() {
    const settings = loadSettings();
    if (settings) {
        elements.tutoringLanguageSelect.value = settings.tutoringLanguage || '';
        elements.tutorsLanguageSelect.value = settings.tutorsLanguage || '';
        elements.interventionLevelSelect.value = settings.interventionLevel || 'medium';
        elements.tutorsVoiceSelect.value = settings.tutorsVoice || 'alloy';
        elements.partnersVoiceSelect.value = settings.partnersVoice || 'nova';
        elements.disableTutorCheckbox.checked = settings.disableTutor || false;
        elements.accentIgnoreCheckbox.checked = settings.accentIgnore || true;
        elements.modelSelect.value = settings.model || 'Grok';
        elements.playbackSpeedSlider.value = settings.playbackSpeed || 1;
        elements.pauseTimeSlider.value = settings.pauseTime || 2;

        // Update controller with loaded settings
        tutorController.setTutoringLanguage(settings.tutoringLanguage);
        tutorController.updateTutorsLanguage(settings.tutorsLanguage);
        tutorController.setInterventionLevel(settings.interventionLevel);
        tutorController.updateTutorsVoice(settings.tutorsVoice || 'alloy');
        tutorController.updatePartnersVoice(settings.partnersVoice || 'nova');
        tutorController.setDisableTutor(settings.disableTutor);
        tutorController.setAccentIgnore(settings.accentIgnore);
        tutorController.updateModel(settings.model);
        tutorController.setPlaybackSpeed(settings.playbackSpeed);
        tutorController.setPauseTime(settings.pauseTime);

        updatePlaybackSpeed();
        updatePauseTime();
    }
}

// Function to save current settings
function saveCurrentSettings() {
    const settings = {
        tutoringLanguage: elements.tutoringLanguageSelect.value,
        tutorsLanguage: elements.tutorsLanguageSelect.value,
        interventionLevel: elements.interventionLevelSelect.value,
        tutorsVoice: elements.tutorsVoiceSelect.value,
        partnersVoice: elements.partnersVoiceSelect.value,
        disableTutor: elements.disableTutorCheckbox.checked,
        accentIgnore: elements.accentIgnoreCheckbox.checked,
        model: elements.modelSelect.value,
        playbackSpeed: elements.playbackSpeedSlider.value,
        pauseTime: elements.pauseTimeSlider.value
    };
    saveSettings(settings);
}

// Clean up before page unload
window.addEventListener('beforeunload', (event) => {
    clearInterval(monitoringInterval);
    // Optionally, you can show a confirmation dialog
    // event.preventDefault(); // Cancel the event
    // event.returnValue = ''; // Show a generic message in some browsers
});
