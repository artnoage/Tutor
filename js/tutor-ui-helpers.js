import { tutorController } from './tutor-core.js';
import { tutoringLanguageOptions, tutorsLanguageOptions } from './languages.js';

export function updateChatList() {
    const chatList = document.getElementById('chatList');
    chatList.innerHTML = '';
    tutorController.chatObjects.sort((a, b) => b.timestamp - a.timestamp).forEach((chat) => {
        const chatItem = document.createElement('div');
        chatItem.className = 'chat-item';
        const timestamp = chat.timestamp ? new Date(chat.timestamp).toLocaleString() : 'Invalid Date';
        chatItem.textContent = `Chat ${timestamp}`;
        chatItem.dataset.timestamp = chat.timestamp;
        chatItem.onclick = () => {
            tutorController.switchChat(chat.timestamp);
        };
        chatList.appendChild(chatItem);
    });
    highlightSelectedChat();
}

export function updateChatDisplay(chatObject) {
    const chatHistoryDisplay = document.getElementById('chatHistoryDisplay');
    const tutorsCommentsDisplay = document.getElementById('tutorsCommentsDisplay');

    chatHistoryDisplay.innerHTML = '';
    chatObject.chat_history.forEach((message, index) => {
        const messageElement = document.createElement('p');
        let prefix = message.type === 'HumanMessage' ? 'You: ' : 
                     message.type === 'AIMessage' ? 'Bot: ' : 
                     `${message.type}: `;
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

export function updateUIState(isActive) {
    document.getElementById('startTutorButton').disabled = isActive;
    document.getElementById('stopTutorButton').disabled = !isActive;
    document.getElementById('sendButton').disabled = !isActive;
    if (!isActive) {
        hideProcessingState();
    }
}

export function showProcessingState() {
    document.getElementById('statusDisplay').textContent = "Processing...";
    document.getElementById('thinkingSpinner').classList.remove('hidden');
}

export function hideProcessingState() {
    document.getElementById('thinkingSpinner').classList.add('hidden');
    document.getElementById('sendButton').disabled = false;
}

export function updateSoundLevelDisplay(average, isSilent) {
    const soundLevelDisplay = document.getElementById('soundLevelDisplay');
    const statusDisplay = document.getElementById('statusDisplay');

    if (average === null || isSilent === null) {
        soundLevelDisplay.textContent = "Sound Level: N/A";
        statusDisplay.textContent = "Tutor inactive";
    } else {
        soundLevelDisplay.textContent = `Sound Level: ${average.toFixed(2)} - ${isSilent ? 'Silent' : 'Not Silent'}`;
        statusDisplay.textContent = tutorController.isRecording
            ? `Recording... ${isSilent ? 'Silent' : 'Not Silent'}`
            : `Monitoring... ${isSilent ? 'Silent' : 'Sound Detected'}`;
    }
}

export function updatePlaybackSpeed() {
    const playbackSpeedSlider = document.getElementById('playbackSpeedSlider');
    const playbackSpeedDisplay = document.getElementById('playbackSpeedDisplay');
    const sliderValue = parseFloat(playbackSpeedSlider.value);
    const playbackSpeed = 0.9 + (sliderValue * 0.1);
    const displayPercentage = Math.round(playbackSpeed * 100);
    playbackSpeedDisplay.textContent = `${displayPercentage}%`;
}

export function updatePauseTime() {
    const pauseTimeSlider = document.getElementById('pauseTimeSlider');
    const pauseTimeDisplay = document.getElementById('pauseTimeDisplay');
    const pauseTime = parseInt(pauseTimeSlider.value);
    pauseTimeDisplay.textContent = pauseTime + " sec";
    tutorController.setPauseTime(pauseTime);
}

export function updateInfoWindow(message) {
    const infoWindow = document.getElementById('infoWindow');
    const newInfo = document.createElement('p');
    newInfo.textContent = message;
    infoWindow.appendChild(newInfo);
    infoWindow.scrollTop = infoWindow.scrollHeight;
}

export function highlightSelectedChat() {
    const chatList = document.getElementById('chatList');
    chatList.querySelectorAll('.chat-item').forEach(item => {
        item.classList.remove('chat-item-selected', 'scale-105', 'shadow-lg');
        item.textContent = item.textContent.replace('► ', '');
    });
    const selectedChatItem = chatList.querySelector(`[data-timestamp="${tutorController.currentChatTimestamp}"]`);
    if (selectedChatItem) {
        selectedChatItem.classList.add('chat-item-selected', 'scale-105', 'shadow-lg');
        selectedChatItem.textContent = '► ' + selectedChatItem.textContent;
    }
}

export function deleteLocalHistory() {
    if (confirm("Are you sure you want to delete all local chat history and clear the cache? This action cannot be undone.")) {
        Promise.all([
            indexedDB.deleteDatabase("TutorChatDB"),
            caches.keys().then(cacheNames => Promise.all(cacheNames.map(name => caches.delete(name))))
        ]).then(() => {
            console.log("IndexedDB TutorChatDB and caches deleted successfully");
            tutorController.chatObjects = [];
            tutorController.currentChatTimestamp = null;
            updateChatList();
            updateChatDisplay({ chat_history: [], tutors_comments: [], summary: [] });
            alert("Local history and cache have been deleted. The page will now refresh.");
        }).then(() => {
            window.location.href = window.location.href.split('#')[0] + '?cache-bust=' + Date.now();
        }).catch(error => {
            console.error("Error deleting data:", error);
            alert("An error occurred while deleting data. Please try again.");
        });
    }
}

export function deleteSelectedChat() {
    if (!tutorController.currentChatTimestamp) {
        alert("No chat selected to delete.");
        return;
    }

    if (confirm("Are you sure you want to delete the selected chat? This action cannot be undone.")) {
        tutorController.chatObjects = tutorController.chatObjects.filter(chat => chat.timestamp !== tutorController.currentChatTimestamp);
        tutorController.saveChatObjects();

        if (tutorController.chatObjects.length === 0) {
            tutorController.currentChatTimestamp = null;
            alert("Last chat deleted. The page will now refresh to create a new chat.");
            window.location.reload();
        } else {
            tutorController.currentChatTimestamp = tutorController.chatObjects[tutorController.chatObjects.length - 1].timestamp;
            updateChatDisplay(tutorController.getCurrentChat());
            updateChatList();
            alert("Selected chat has been deleted.");
        }
    }
}

export function populateMicrophoneSelect() {
    const microphoneSelect = document.getElementById('microphoneSelect');
    const statusDisplay = document.getElementById('statusDisplay');

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
            tutorController.setMicrophone(microphoneSelect.value);
        })
        .catch(err => {
            console.error("Error enumerating devices:", err);
            statusDisplay.textContent = "Error: Could not list audio devices";
        });
}

export function populateLanguageSelects() {
    const tutoringLanguageSelect = document.getElementById('tutoringLanguageSelect');
    const tutorsLanguageSelect = document.getElementById('tutorsLanguageSelect');
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

export function initializeUI() {
    populateMicrophoneSelect();
    populateLanguageSelects();
    updatePlaybackSpeed();
    updatePauseTime();

    const pauseTimeSlider = document.getElementById('pauseTimeSlider');
    pauseTimeSlider.min = 1;
    pauseTimeSlider.max = 10;
    pauseTimeSlider.value = 2;
    pauseTimeSlider.step = 1;

    document.getElementById('thinkingSpinner').classList.add('hidden');

    tutorController.setFormElements({
        tutoringLanguageSelect: document.getElementById('tutoringLanguageSelect'),
        tutorsLanguageSelect: document.getElementById('tutorsLanguageSelect'),
        tutorsVoiceSelect: document.getElementById('tutorsVoiceSelect'),
        partnersVoiceSelect: document.getElementById('partnersVoiceSelect'),
        interventionLevelSelect: document.getElementById('interventionLevelSelect'),
        playbackSpeedSlider: document.getElementById('playbackSpeedSlider'),
        pauseTimeSlider: document.getElementById('pauseTimeSlider'),
        disableTutorCheckbox: document.getElementById('disableTutorCheckbox'),
        accentIgnoreCheckbox: document.getElementById('accentIgnoreCheckbox'),
        modelSelect: document.getElementById('modelSelect')
    });

    // Set default intervention level to medium
    document.getElementById('interventionLevelSelect').value = 'medium';

    tutorController.setUICallbacks({
        onMonitoringStart: () => {
            console.log('Monitoring started');
            document.getElementById('statusDisplay').textContent = "Starting monitoring...";
        },
        onProcessingStart: showProcessingState,
        onAudioPlayStart: () => {
            document.getElementById('statusDisplay').textContent = "Playing audio...";
        },
        onRecordingDiscarded: (reason) => {
            document.getElementById('statusDisplay').textContent = `Recording discarded: ${reason}. Restarting...`;
            updateInfoWindow(`Recording discarded: ${reason}`);
            hideProcessingState();
        },
        onSoundLevelUpdate: updateSoundLevelDisplay,
        onError: (errorMessage) => {
            document.getElementById('statusDisplay').textContent = "Error: " + errorMessage;
            hideProcessingState();
        },
        onAPIResponseReceived: (chatObject) => {
            updateChatDisplay(chatObject);
            document.getElementById('statusDisplay').textContent = "Updated chat display with API response";
            hideProcessingState();
        },
        onChatCreated: (timestamp) => {
            updateChatList();
            updateChatDisplay(tutorController.getCurrentChat());
        },
        onChatSwitched: (chatObject) => {
            updateChatDisplay(chatObject);
            updateChatList();
        },
        onChatObjectsLoaded: () => {
            updateChatList();
            ensureAtLeastOneChat();
        },
        onInitialLoadComplete: () => {
            ensureAtLeastOneChat();
            updateChatList();
            updateChatDisplay(tutorController.getCurrentChat());
        },
        onInfoUpdate: updateInfoWindow
    });

    tutorController.setFormElements({
        tutoringLanguageSelect: document.getElementById('tutoringLanguageSelect'),
        tutorsLanguageSelect: document.getElementById('tutorsLanguageSelect'),
        tutorsVoiceSelect: document.getElementById('tutorsVoiceSelect'),
        partnersVoiceSelect: document.getElementById('partnersVoiceSelect'),
        interventionLevelSelect: document.getElementById('interventionLevelSelect'),
        playbackSpeedSlider: document.getElementById('playbackSpeedSlider'),
        pauseTimeSlider: document.getElementById('pauseTimeSlider'),
        disableTutorCheckbox: document.getElementById('disableTutorCheckbox'),
        accentIgnoreCheckbox: document.getElementById('accentIgnoreCheckbox'),
        modelSelect: document.getElementById('modelSelect')
    });

    // Set default intervention level to medium
    document.getElementById('interventionLevelSelect').value = 'medium';

    tutorController.setUICallbacks({
        onMonitoringStart: () => {
            console.log('Monitoring started');
            document.getElementById('statusDisplay').textContent = "Starting monitoring...";
        },
        onProcessingStart: showProcessingState,
        onAudioPlayStart: () => {
            document.getElementById('statusDisplay').textContent = "Playing audio...";
        },
        onRecordingDiscarded: (reason) => {
            document.getElementById('statusDisplay').textContent = `Recording discarded: ${reason}. Restarting...`;
            updateInfoWindow(`Recording discarded: ${reason}`);
            hideProcessingState();
        },
        onSoundLevelUpdate: updateSoundLevelDisplay,
        onError: (errorMessage) => {
            document.getElementById('statusDisplay').textContent = "Error: " + errorMessage;
            hideProcessingState();
        },
        onAPIResponseReceived: (chatObject) => {
            updateChatDisplay(chatObject);
            document.getElementById('statusDisplay').textContent = "Updated chat display with API response";
            hideProcessingState();
        },
        onChatCreated: (timestamp) => {
            updateChatList();
            updateChatDisplay(tutorController.getCurrentChat());
        },
        onChatSwitched: (chatObject) => {
            updateChatDisplay(chatObject);
            updateChatList();
        },
        onChatObjectsLoaded: () => {
            updateChatList();
            ensureAtLeastOneChat();
        },
        onInitialLoadComplete: () => {
            ensureAtLeastOneChat();
            updateChatList();
            updateChatDisplay(tutorController.getCurrentChat());
        },
        onInfoUpdate: updateInfoWindow
    });

    ensureAtLeastOneChat();
}

function ensureAtLeastOneChat() {
    if (tutorController.chatObjects.length === 0) {
        tutorController.createNewChat().then(() => {
            updateChatList();
            updateChatDisplay(tutorController.getCurrentChat());
        });
    }
}

export function debugPrintChats(chatObjects) {
    let debugInfo = "Current chat list:\n";
    chatObjects.sort((a, b) => b.timestamp - a.timestamp).forEach((chat, index) => {
        const timestamp = chat.timestamp ? new Date(chat.timestamp).toLocaleString() : 'Invalid Date';
        debugInfo += `Chat ${index + 1}: ${timestamp}\n`;
    });
    updateInfoWindow(debugInfo);
}
export function updateHomeworkChatDisplay(chatObject) {
    const homeworkChatDisplay = document.getElementById('homeworkChatDisplay');
    homeworkChatDisplay.innerHTML = '';
    chatObject.homework_chat.forEach((message) => {
        const messageElement = document.createElement('p');
        messageElement.innerHTML = `<strong>${message.sender}:</strong> ${message.content}`;
        homeworkChatDisplay.appendChild(messageElement);
    });
    homeworkChatDisplay.scrollTop = homeworkChatDisplay.scrollHeight;
}
