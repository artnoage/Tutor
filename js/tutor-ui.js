import { tutorController } from './tutor-core.js';
import { sendHomeworkRequest } from './api-service.js';
import { settingsManager } from './settings-manager.js';
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
    clearHomeworkButton: document.getElementById('clearHomeworkButton'),
    homeworkChatDisplay: document.getElementById('homeworkChatDisplay'),
    settingsButton: document.getElementById('settingsButton'),
    settingsOverlay: document.getElementById('settingsOverlay'),
    closeSettingsButton: document.getElementById('closeSettingsButton'),
    apiKeyInput: document.getElementById('apiKeyInput'),
    sendApiKeyButton: document.getElementById('sendApiKeyButton'),
    settingsInfoBox: document.getElementById('settingsInfoBox'),
    toggleTutorButton: document.getElementById('toggleTutorButton')
};

// Event listeners
elements.settingsButton.addEventListener('click', () => {
    elements.settingsOverlay.classList.remove('hidden');
});

elements.closeSettingsButton.addEventListener('click', () => {
    elements.settingsOverlay.classList.add('hidden');
});

elements.toggleTutorButton.addEventListener('click', async () => {
    if (tutorController.isActive) {
        try {
            await tutorController.stop();
            updateUIState(false);
            elements.statusDisplay.textContent = "Stopped";
        } catch (error) {
            console.error("Error stopping tutor:", error);
            elements.statusDisplay.textContent = "Error: Failed to stop tutor";
        }
    } else {
        console.log('Start button clicked');
        tutorController.start();
        updateUIState(true);
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
    const newChat = await tutorController.createNewChat(
        elements.modelSelect,
        elements.tutoringLanguageSelect
    );
    if (newChat !== null) {
        await updateChatList();
        updateChatDisplay(newChat);
    }
});

elements.playbackSpeedSlider.addEventListener('input', (e) => {
    updatePlaybackSpeed();
    settingsManager.updateSetting('playbackSpeed', parseFloat(e.target.value));
    updateSettingsInfoBox(`Playback speed updated to ${e.target.value}`);
});

elements.pauseTimeSlider.addEventListener('input', (e) => {
    updatePauseTime();
    settingsManager.updateSetting('pauseTime', parseInt(e.target.value));
    updateSettingsInfoBox(`Pause time updated to ${e.target.value} seconds`);
});

elements.tutoringLanguageSelect.addEventListener('change', (e) => {
    tutorController.setTutoringLanguage(e.target.value);
    settingsManager.updateSetting('tutoringLanguage', e.target.value);
    updateSettingsInfoBox(`Tutoring language updated to ${e.target.value}`);
});

elements.tutorsLanguageSelect.addEventListener('change', (e) => {
    tutorController.updateTutorsLanguage(e.target.value);
    settingsManager.updateSetting('tutorsLanguage', e.target.value);
    updateSettingsInfoBox(`Tutor's language updated to ${e.target.value}`);
});

elements.interventionLevelSelect.addEventListener('change', (e) => {
    tutorController.updateInterventionLevel(e.target.value);
    settingsManager.updateSetting('interventionLevel', e.target.value);
    updateSettingsInfoBox(`Intervention level updated to ${e.target.value}`);
});

elements.tutorsVoiceSelect.addEventListener('change', (e) => {
    tutorController.updateTutorsVoice(e.target.value);
    settingsManager.updateSetting('tutorsVoice', e.target.value);
    updateSettingsInfoBox(`Tutor's voice updated to ${e.target.value}`);
});

elements.partnersVoiceSelect.addEventListener('change', (e) => {
    tutorController.updatePartnersVoice(e.target.value);
    settingsManager.updateSetting('partnersVoice', e.target.value);
    updateSettingsInfoBox(`Partner's voice updated to ${e.target.value}`);
});

elements.microphoneSelect.addEventListener('change', (e) => {
    tutorController.setMicrophone(e.target.value);
    updateSettingsInfoBox(`Microphone updated to ${e.target.options[e.target.selectedIndex].text}`);
});

elements.disableTutorCheckbox.addEventListener('change', (e) => {
    tutorController.setDisableTutor(e.target.checked);
    settingsManager.updateSetting('disableTutor', e.target.checked);
    updateSettingsInfoBox(`Tutor ${e.target.checked ? 'disabled' : 'enabled'}`);
});

elements.accentIgnoreCheckbox.addEventListener('change', (e) => {
    tutorController.setAccentIgnore(e.target.checked);
    settingsManager.updateSetting('accentIgnore', e.target.checked);
    updateSettingsInfoBox(`Accent ignore ${e.target.checked ? 'enabled' : 'disabled'}`);
});

elements.modelSelect.addEventListener('change', (e) => {
    tutorController.updateModel(e.target.value);
    settingsManager.updateSetting('model', e.target.value);
    updateApiKeyInput();
    updateSettingsInfoBox(`AI model updated to ${e.target.value}`);
});

elements.sendApiKeyButton.addEventListener('click', async () => {
    const model = elements.modelSelect.value;
    const apiKey = elements.apiKeyInput.value;
    try {
        const updated = await settingsManager.updateSetting(`${model.toLowerCase()}ApiKey`, apiKey);
        if (updated) {
            updateSettingsInfoBox(`API key for ${model} verified and saved successfully.`);
            elements.apiKeyInput.value = ''; // Clear the input after successful save
        }
    } catch (error) {
        updateSettingsInfoBox(`Error: ${error.message}`);
    }
    elements.apiKeyInput.value = ''; // Clear the input regardless of success or failure
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

elements.clearHomeworkButton.addEventListener('click', () => {
    elements.homeworkChatDisplay.innerHTML = '';
    updateSettingsInfoBox('Homework chat cleared');
});

function updateSettingsInfoBox(message) {
    elements.settingsInfoBox.textContent = message;
}

function updateApiKeyInput() {
    const model = elements.modelSelect.value;
    const apiKey = settingsManager.getSetting(`${model.toLowerCase()}ApiKey`) || '';
    elements.apiKeyInput.value = apiKey;
}
function addMessageToHomeworkChat(sender, message) {
    const messageElement = document.createElement('p');
    messageElement.innerHTML = `<strong>${sender}:</strong> ${message}`;
    elements.homeworkChatDisplay.appendChild(messageElement);
    elements.homeworkChatDisplay.scrollTop = elements.homeworkChatDisplay.scrollHeight;
}

// Initialize UI
initializeUI();

// Update API key input after initializing the UI
updateApiKeyInput();

// Start monitoring interval
const monitoringInterval = tutorController.startMonitoringInterval();

// Clean up before page unload
window.addEventListener('beforeunload', (event) => {
    clearInterval(monitoringInterval);
    // Optionally, you can show a confirmation dialog
    // event.preventDefault(); // Cancel the event
    // event.returnValue = ''; // Show a generic message in some browsers
});
