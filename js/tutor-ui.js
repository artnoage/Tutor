import { tutorController } from './tutor-core.js';
import { motherTongueOptions, tutoringLanguageOptions, tutorsLanguageOptions } from './languages.js';

// DOM elements
const startTutorButton = document.getElementById('startTutorButton');
const stopTutorButton = document.getElementById('stopTutorButton');
const statusDisplay = document.getElementById('statusDisplay');
const microphoneSelect = document.getElementById('microphoneSelect');
const soundLevelDisplay = document.getElementById('soundLevelDisplay');
const playbackSpeedSlider = document.getElementById('playbackSpeedSlider');
const playbackSpeedDisplay = document.getElementById('playbackSpeedDisplay');
const motherTongueSelect = document.getElementById('motherTongueSelect');
const tutoringLanguageSelect = document.getElementById('tutoringLanguageSelect');
const tutorsLanguageSelect = document.getElementById('tutorsLanguageSelect');
const interventionLevelSelect = document.getElementById('interventionLevelSelect');
const tutorsVoiceSelect = document.getElementById('tutorsVoiceSelect');
const partnersVoiceSelect = document.getElementById('partnersVoiceSelect');
const infoWindow = document.getElementById('infoWindow');
const chatHistoryDisplay = document.getElementById('chatHistoryDisplay');
const tutorsCommentsDisplay = document.getElementById('tutorsCommentsDisplay');
const summaryDisplay = document.getElementById('summaryDisplay');

// Event listeners
startTutorButton.addEventListener('click', () => {
    tutorController.start();
    startTutorButton.disabled = true;
    stopTutorButton.disabled = false;
});

stopTutorButton.addEventListener('click', () => {
    tutorController.stop();
    resetButtons();
    statusDisplay.textContent = "Stopped";
});

playbackSpeedSlider.addEventListener('input', updatePlaybackSpeed);
motherTongueSelect.addEventListener('change', updateMotherTongue);
tutoringLanguageSelect.addEventListener('change', updateTutoringLanguage);
tutorsLanguageSelect.addEventListener('change', updateTutorsLanguage);
interventionLevelSelect.addEventListener('change', updateInterventionLevel);
tutorsVoiceSelect.addEventListener('change', updateTutorsVoice);
partnersVoiceSelect.addEventListener('change', updatePartnersVoice);
microphoneSelect.addEventListener('change', updateMicrophone);

function resetButtons() {
    startTutorButton.disabled = false;
    stopTutorButton.disabled = true;
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
    const playbackSpeed = 0.9 + (sliderValue * 0.1); // Map 0-1 to 0.9-1
    const displayPercentage = Math.round(playbackSpeed * 100);
    playbackSpeedDisplay.textContent = `${displayPercentage}%`;
}

function updateMotherTongue() {
    const selectedLanguage = motherTongueSelect.value;
    updateInfoWindow(`Selected Mother Tongue: ${selectedLanguage}`);
}

function updateTutoringLanguage() {
    const selectedLanguage = tutoringLanguageSelect.value;
    updateInfoWindow(`Selected Tutoring Language: ${selectedLanguage}`);
}

function updateTutorsLanguage() {
    const selectedLanguage = tutorsLanguageSelect.value;
    updateInfoWindow(`Selected Tutor's Language: ${selectedLanguage}`);
}

function updateInterventionLevel() {
    const selectedLevel = interventionLevelSelect.value;
    updateInfoWindow(`Selected Tutor's Intervention Level: ${selectedLevel}`);
}

function updateTutorsVoice() {
    const selectedVoice = tutorsVoiceSelect.value;
    updateInfoWindow(`Selected Tutor's Voice: ${selectedVoice}`);
}

function updatePartnersVoice() {
    const selectedVoice = partnersVoiceSelect.value;
    updateInfoWindow(`Selected Partner's Voice: ${selectedVoice}`);
}

function updateMicrophone() {
    const selectedMicrophoneId = microphoneSelect.value;
    tutorController.setMicrophone(selectedMicrophoneId);
    updateInfoWindow(`Selected Microphone: ${microphoneSelect.options[microphoneSelect.selectedIndex].text}`);
}

function updateInfoWindow(message) {
    const newInfo = document.createElement('p');
    newInfo.textContent = message;
    infoWindow.appendChild(newInfo);
    infoWindow.scrollTop = infoWindow.scrollHeight;
}

function populateMicrophoneSelect() {
    navigator.mediaDevices.enumerateDevices()
        .then(devices => {
            const audioInputDevices = devices.filter(device => device.kind === 'audioinput');
            microphoneSelect.innerHTML = ''; // Clear existing options
            audioInputDevices.forEach(device => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.text = device.label || `Microphone ${microphoneSelect.length + 1}`;
                microphoneSelect.appendChild(option);
            });
            updateMicrophone(); // Set initial microphone
        })
        .catch(err => {
            console.error("Error enumerating devices:", err);
            statusDisplay.textContent = "Error: Could not list audio devices";
        });
}

function populateLanguageSelects() {
    const languageSets = [
        { select: motherTongueSelect, options: motherTongueOptions },
        { select: tutoringLanguageSelect, options: tutoringLanguageOptions },
        { select: tutorsLanguageSelect, options: tutorsLanguageOptions }
    ];

    languageSets.forEach(({ select, options }) => {
        const languages = options.split(',');
        select.innerHTML = ''; // Clear existing options
        languages.forEach((language, index) => {
            const option = document.createElement('option');
            option.value = language;
            option.text = language;
            option.setAttribute('data-order', index); // Set a custom order attribute
            select.appendChild(option);
        });
        // Sort the options based on the custom order
        Array.from(select.options)
            .sort((a, b) => a.getAttribute('data-order') - b.getAttribute('data-order'))
            .forEach(option => select.appendChild(option));
    });
}
function updateChatDisplay(chatObject) {
    // Update chat history
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
            prefix = `${message.type}: `;  // For any other types, we'll still show the type
    }
    messageElement.textContent = `${index + 1}. ${prefix}${message.content}`;
    chatHistoryDisplay.appendChild(messageElement);
});

    // Update tutor's comments
    tutorsCommentsDisplay.innerHTML = '';
    chatObject.tutors_comments.forEach((comment, index) => {
        const commentElement = document.createElement('p');
        commentElement.textContent = `${index + 1}. ${comment}`;
        tutorsCommentsDisplay.appendChild(commentElement);
    });

    // Update summary
    summaryDisplay.innerHTML = '';
    chatObject.summary.forEach((item, index) => {
        const summaryElement = document.createElement('p');
        summaryElement.textContent = `${index + 1}. ${item}`;
        summaryDisplay.appendChild(summaryElement);
    });
}

function initializeUI() {
    populateMicrophoneSelect();
    populateLanguageSelects();
    updatePlaybackSpeed();
    updateMotherTongue();
    updateTutoringLanguage();
    updateTutorsLanguage();
    updateInterventionLevel();
    updateTutorsVoice();
    updatePartnersVoice();

    // Set up form elements for tutorController
    tutorController.setFormElements({
        motherTongueSelect,
        tutoringLanguageSelect,
        tutorsLanguageSelect,
        tutorsVoiceSelect,
        partnersVoiceSelect,
        interventionLevelSelect,
        playbackSpeedSlider
    });

    // Set up UI callbacks for tutorController
    tutorController.setUICallbacks({
        onMonitoringStart: () => {
            statusDisplay.textContent = "Starting monitoring...";
        },
        onProcessingStart: () => {
            statusDisplay.textContent = "Processing audio...";
        },
        onChatHistoryReceived: (chatHistory) => {
            statusDisplay.textContent = "Displaying chat history and preparing audio...";
            chatHistoryDisplay.textContent = chatHistory;
        },
        onTutorsFeedbackReceived: (feedback) => {
            tutorsCommentsDisplay.textContent = feedback;
        },
        onSummaryUpdated: (summary) => {
            summaryDisplay.textContent = summary;
        },
        onAudioPlayStart: () => {
            statusDisplay.textContent = "Playing audio...";
        },
        onRecordingDiscarded: (reason) => {
            statusDisplay.textContent = `Recording discarded: ${reason}. Restarting...`;
            updateInfoWindow(`Recording discarded: ${reason}`);
        },
        onSoundLevelUpdate: updateSoundLevelDisplay,
        onError: (errorMessage) => {
            statusDisplay.textContent = "Error: " + errorMessage;
        },
        onAPIResponseReceived: (result) => {
            updateChatDisplay(result.chatObject);
            statusDisplay.textContent = "Updated chat display with API response";
        }
    });
}

// Start monitoring sound levels
const monitoringInterval = tutorController.startMonitoringInterval();

// Clean up the interval when the page is unloaded
window.addEventListener('unload', () => {
    clearInterval(monitoringInterval);
});

// Initialize UI when the page loads
initializeUI();