import { tutorController } from './tutor-core.js';
import { tutoringLanguageOptions, tutorsLanguageOptions } from './languages.js';

const startTutorButton = document.getElementById('startTutorButton');
const stopTutorButton = document.getElementById('stopTutorButton');
const sendButton = document.getElementById('sendButton');
const restartChatButton = document.getElementById('restartChatButton');
const createChatButton = document.getElementById('createChatButton');
const statusDisplay = document.getElementById('statusDisplay');
const microphoneSelect = document.getElementById('microphoneSelect');
const soundLevelDisplay = document.getElementById('soundLevelDisplay');
const playbackSpeedSlider = document.getElementById('playbackSpeedSlider');
const playbackSpeedDisplay = document.getElementById('playbackSpeedDisplay');
const pauseTimeSlider = document.getElementById('pauseTimeSlider');
const pauseTimeDisplay = document.getElementById('pauseTimeDisplay');
const tutoringLanguageSelect = document.getElementById('tutoringLanguageSelect');
const tutorsLanguageSelect = document.getElementById('tutorsLanguageSelect');
const interventionLevelSelect = document.getElementById('interventionLevelSelect');
const tutorsVoiceSelect = document.getElementById('tutorsVoiceSelect');
const partnersVoiceSelect = document.getElementById('partnersVoiceSelect');
const infoWindow = document.getElementById('infoWindow');
const chatHistoryDisplay = document.getElementById('chatHistoryDisplay');
const tutorsCommentsDisplay = document.getElementById('tutorsCommentsDisplay');
const thinkingSpinner = document.getElementById('thinkingSpinner');
const disableTutorCheckbox = document.getElementById('disableTutorCheckbox');
const accentIgnoreCheckbox = document.getElementById('accentIgnoreCheckbox');
const modelSelect = document.getElementById('modelSelect');
const chatList = document.getElementById('chatList');
const deleteLocalHistoryButton = document.getElementById('deleteLocalHistoryButton');

disableTutorCheckbox.addEventListener('change', updateDisableTutor);
accentIgnoreCheckbox.addEventListener('change', updateAccentIgnore);
modelSelect.addEventListener('change', updateModel);
deleteLocalHistoryButton.addEventListener('click', deleteLocalHistory);

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

sendButton.addEventListener('click', manualSend);
restartChatButton.addEventListener('click', () => {
    const wasActive = tutorController.isActive;
    tutorController.restartChat();
    updateUIState(wasActive);
    statusDisplay.textContent = "Chat restarted";
});

createChatButton.addEventListener('click', () => {
    tutorController.createNewChat();
    updateChatList();
});

playbackSpeedSlider.addEventListener('input', updatePlaybackSpeed);
pauseTimeSlider.addEventListener('input', updatePauseTime);
tutoringLanguageSelect.addEventListener('change', updateTutoringLanguage);
tutorsLanguageSelect.addEventListener('change', updateTutorsLanguage);
interventionLevelSelect.addEventListener('change', updateInterventionLevel);
tutorsVoiceSelect.addEventListener('change', updateTutorsVoice);
partnersVoiceSelect.addEventListener('change', updatePartnersVoice);
microphoneSelect.addEventListener('change', updateMicrophone);

function updateUIState(isActive) {
    startTutorButton.disabled = isActive;
    stopTutorButton.disabled = !isActive;
    sendButton.disabled = !isActive;
    if (!isActive) {
        hideProcessingState();
    }
}

function manualSend() {
    if (tutorController.isActive) {
        tutorController.manualStop();
        sendButton.disabled = true;
        showProcessingState();
    }
}

function showProcessingState() {
    statusDisplay.textContent = "Processing...";
    thinkingSpinner.classList.remove('hidden');
}

function hideProcessingState() {
    thinkingSpinner.classList.add('hidden');
    sendButton.disabled = false;
}

function updateSoundLevelDisplay(average, isSilent) {
    if (average === null || isSilent === null) {
        soundLevelDisplay.textContent = "Sound Level: N/A";
        statusDisplay.textContent = "Tutor inactive";
    } else {
        soundLevelDisplay.textContent = `Sound Level: ${average.toFixed(2)} - ${isSilent ? 'Silent' : 'Not Silent'}`;
        if (tutorController.isRecording) {
            statusDisplay.textContent = `Recording... ${isSilent ? 'Silent' : 'Not Silent'}`;
        } else {
            statusDisplay.textContent = `Monitoring... ${isSilent ? 'Silent' : 'Sound Detected'}`;
        }
    }
}

function updatePlaybackSpeed() {
    const sliderValue = parseFloat(playbackSpeedSlider.value);
    const playbackSpeed = 0.9 + (sliderValue * 0.1);
    const displayPercentage = Math.round(playbackSpeed * 100);
    playbackSpeedDisplay.textContent = `${displayPercentage}%`;
}

function updatePauseTime() {
    const pauseTime = parseInt(pauseTimeSlider.value);
    pauseTimeDisplay.textContent = pauseTime + " sec";
    tutorController.setPauseTime(pauseTime);
}

function updateTutoringLanguage() {
    const selectedLanguage = tutoringLanguageSelect.value;
}

function updateTutorsLanguage() {
    const selectedLanguage = tutorsLanguageSelect.value;
}

function updateInterventionLevel() {
    const selectedLevel = interventionLevelSelect.value;
}

function updateTutorsVoice() {
    const selectedVoice = tutorsVoiceSelect.value;
}

function updatePartnersVoice() {
    const selectedVoice = partnersVoiceSelect.value;
}

function updateModel() {
    const selectedModel = modelSelect.value;
}

function updateDisableTutor() {
    const disableTutor = disableTutorCheckbox.checked;
    tutorController.setDisableTutor(disableTutor);
}

function updateAccentIgnore() {
    const accentIgnore = accentIgnoreCheckbox.checked;
    tutorController.setAccentIgnore(accentIgnore);
}

function updateMicrophone() {
    const selectedMicrophoneId = microphoneSelect.value;
    tutorController.setMicrophone(selectedMicrophoneId);
}

function updateInfoWindow(message) {
    const newInfo = document.createElement('p');
    newInfo.textContent = message;
    infoWindow.appendChild(newInfo);
    infoWindow.scrollTop = infoWindow.scrollHeight;
}

// Updated function to dynamically update the chat list in the sidebar
function updateChatList() {
    chatList.innerHTML = '';
    tutorController.chatObjects.slice().reverse().forEach((chatObject, index) => {
        const chatItem = document.createElement('div');
        chatItem.className = 'chat-item';
        const chatDate = new Date(chatObject.name);
        chatItem.textContent = chatDate.toLocaleString();
        chatItem.dataset.index = tutorController.chatObjects.length - index - 1;
        chatItem.addEventListener('click', () => {
            tutorController.switchChat(parseInt(chatItem.dataset.index));
            updateChatDisplay(tutorController.getCurrentChat());
            highlightSelectedChat();
        });
        chatList.appendChild(chatItem);
    });
    highlightSelectedChat();
}

// Function to highlight the selected chat
function highlightSelectedChat() {
    chatList.querySelectorAll('.chat-item').forEach(item => {
        item.classList.remove('chat-item-selected', 'scale-105', 'shadow-lg');
        item.textContent = item.textContent.replace('► ', '');
    });
    const selectedChatItem = chatList.querySelector(`[data-index="${tutorController.currentChatIndex}"]`);
    if (selectedChatItem) {
        selectedChatItem.classList.add('chat-item-selected', 'scale-105', 'shadow-lg');
        selectedChatItem.textContent = '► ' + selectedChatItem.textContent;
    }
}

// Function to update the chat display area with the current chat's history and comments
function updateChatDisplay(chatObject) {
    chatHistoryDisplay.innerHTML = '';
    chatObject.chat_history.forEach((message, index) => {
        const messageElement = document.createElement('p');
        let prefix;
        switch (message.type) {
            case 'HumanMessage':
                prefix = 'You: ';
                break;
            case 'AIMessage':
                prefix = 'Bot: ';
                break;
            default:
                prefix = `${message.type}: `;
        }
        messageElement.textContent = `${index + 1}. ${prefix}${message.content}`;
        chatHistoryDisplay.appendChild(messageElement);
    });
    chatHistoryDisplay.scrollTop = chatHistoryDisplay.scrollHeight;

    tutorsCommentsDisplay.innerHTML = '';
    chatObject.tutors_comments.forEach((comment, index) => {
        const commentElement = document.createElement('p');
        commentElement.textContent = `${index + 1}. ${comment}`;
        tutorsCommentsDisplay.appendChild(commentElement);
    });
    tutorsCommentsDisplay.scrollTop = tutorsCommentsDisplay.scrollHeight;
}

function deleteLocalHistory() {
    if (confirm("Are you sure you want to delete all local chat history? This action cannot be undone.")) {
        indexedDB.deleteDatabase("TutorChatDB").onsuccess = function() {
            console.log("IndexedDB TutorChatDB deleted successfully");
            tutorController.chatObjects = [];
            tutorController.currentChatIndex = -1;
            updateChatList();
            updateChatDisplay({ chat_history: [], tutors_comments: [], summary: [] });
            alert("Local history has been deleted.");
        };
    }
}

function populateMicrophoneSelect() {
    navigator.mediaDevices.enumerateDevices()
        .then(devices => {
            const audioInputDevices = devices.filter(device => device.kind === 'audioinput');
            microphoneSelect.innerHTML = '';
            audioInputDevices.forEach(device => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.text = device.label || `Microphone ${microphoneSelect.length + 1}`;
                microphoneSelect.appendChild(option);
            });
            updateMicrophone();
        })
        .catch(err => {
            console.error("Error enumerating devices:", err);
            statusDisplay.textContent = "Error: Could not list audio devices";
        });
}

function populateLanguageSelects() {
    const languageSets = [
        { select: tutoringLanguageSelect, options: tutoringLanguageOptions },
        { select: tutorsLanguageSelect, options: tutorsLanguageOptions }
    ];

    languageSets.forEach(({ select, options }) => {
        const languages = options.split(',');
        select.innerHTML = '';
        languages.forEach((language, index) => {
            const option = document.createElement('option');
            option.value = language;
            option.text = language;
            option.setAttribute('data-order', index);
            select.appendChild(option);
        });
        Array.from(select.options)
            .sort((a, b) => a.getAttribute('data-order') - b.getAttribute('data-order'))
            .forEach(option => select.appendChild(option));
    });
}

function initializeUI() {
    populateMicrophoneSelect();
    populateLanguageSelects();
    updatePlaybackSpeed();
    updateTutoringLanguage();
    updateTutorsLanguage();
    updateInterventionLevel();
    updateTutorsVoice();
    updatePartnersVoice();
    updateDisableTutor();
    updateAccentIgnore();

    pauseTimeSlider.min = 1;
    pauseTimeSlider.max = 10;
    pauseTimeSlider.value = 1;
    pauseTimeSlider.step = 1;
    updatePauseTime();

    thinkingSpinner.classList.add('hidden');

    tutorController.setFormElements({
        tutoringLanguageSelect,
        tutorsLanguageSelect,
        tutorsVoiceSelect,
        partnersVoiceSelect,
        interventionLevelSelect,
        playbackSpeedSlider,
        pauseTimeSlider,
        disableTutorCheckbox,
        accentIgnoreCheckbox,
        modelSelect
    });

    tutorController.setUICallbacks({
        onMonitoringStart: () => {
            console.log('Monitoring started');
            statusDisplay.textContent = "Starting monitoring...";
        },
        onProcessingStart: () => {
            showProcessingState();
        },
        onAudioPlayStart: () => {
            statusDisplay.textContent = "Playing audio...";
        },
        onRecordingDiscarded: (reason) => {
            statusDisplay.textContent = `Recording discarded: ${reason}. Restarting...`;
            updateInfoWindow(`Recording discarded: ${reason}`);
            hideProcessingState();
        },
        onSoundLevelUpdate: updateSoundLevelDisplay,
        onError: (errorMessage) => {
            statusDisplay.textContent = "Error: " + errorMessage;
            hideProcessingState();
        },
        onAPIResponseReceived: (chatObject) => {
            updateChatDisplay(chatObject);
            statusDisplay.textContent = "Updated chat display with API response";
            hideProcessingState();
        },
        onChatRestart: () => {
            chatHistoryDisplay.innerHTML = '';
            tutorsCommentsDisplay.innerHTML = '';
            statusDisplay.textContent = "Chat restarted";
        },
        onChatCreated: (index) => {
            updateChatList();
            updateChatDisplay(tutorController.getCurrentChat());
        },
        onChatSwitched: (chatObject) => {
            updateChatDisplay(chatObject);
            updateChatList(); // Update the chat list to reflect the new selection
        },
        onChatObjectsLoaded: () => {
            updateChatList();
            if (tutorController.chatObjects.length > 0) {
                updateChatDisplay(tutorController.getCurrentChat());
            }
        },
        onInitialLoadComplete: () => {
            if (tutorController.chatObjects.length === 0) {
                tutorController.createNewChat();
            }
            updateChatList();
            updateChatDisplay(tutorController.getCurrentChat());
        }
    });
}

const monitoringInterval = tutorController.startMonitoringInterval();

window.addEventListener('unload', () => {
    clearInterval(monitoringInterval);
});

initializeUI();
