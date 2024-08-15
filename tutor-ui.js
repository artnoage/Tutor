import { tutorController, monitorSound } from './tutor-core.js';
import { languageOptions } from './languages.js';

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

// Audio context
let audioContext;

// Event listeners
startTutorButton.addEventListener('click', () => {
    tutorController.start();
    startTutorButton.disabled = true;
    stopTutorButton.disabled = false;
    statusDisplay.textContent = "Starting monitoring...";
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

function resetButtons() {
    startTutorButton.disabled = false;
    stopTutorButton.disabled = true;
}

function updateSoundLevelDisplay(average, isSilent) {
    soundLevelDisplay.textContent = `Sound Level: ${average.toFixed(2)} - ${isSilent ? 'Silent' : 'Not Silent'}`;
    if (isRecording) {
        statusDisplay.textContent = `Recording... ${isSilent ? 'Silent' : 'Not Silent'}`;
    } else {
        statusDisplay.textContent = `Monitoring... ${isSilent ? 'Silent' : 'Sound Detected'}`;
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
        })
        .catch(err => {
            console.error("Error enumerating devices:", err);
            statusDisplay.textContent = "Error: Could not list audio devices";
        });
}

function populateLanguageSelects() {
    const languages = languageOptions.split(',');
    [motherTongueSelect, tutoringLanguageSelect, tutorsLanguageSelect].forEach(select => {
        select.innerHTML = ''; // Clear existing options
        languages.forEach(language => {
            const option = document.createElement('option');
            option.value = language;
            option.text = language;
            select.appendChild(option);
        });
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
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
}

async function processAndPlayAudio(audioBlob) {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.wav');
    
    const audioData = {
        motherTongue: motherTongueSelect.value,
        tutoringLanguage: tutoringLanguageSelect.value,
        tutorsLanguage: tutorsLanguageSelect.value,
        tutorsVoice: tutorsVoiceSelect.value,
        partnersVoice: partnersVoiceSelect.value,
        interventionLevel: interventionLevelSelect.value
    };
    
    formData.append('data', JSON.stringify(audioData));

    try {
        statusDisplay.textContent = "Processing audio...";
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

        console.time('clientProcessing');
        
        // Display transcription immediately
        statusDisplay.textContent = "Displaying transcription and preparing audio...";
        updateInfoWindow(`Transcription: ${result.transcription}`);
        
        // Decode audio data
        const audioBuffer = await decodeAudioData(audioContext, result.audio_base64);
        
        // Play audio
        statusDisplay.textContent = "Playing audio...";
        await playDecodedAudio(audioContext, audioBuffer);
        
        console.timeEnd('clientProcessing');
        
        // Resume monitoring after audio playback
        if (tutorController.isActive) {
            tutorController.startMonitoring();
        }
    } catch (error) {
        console.error('Error processing or playing audio:', error);
        statusDisplay.textContent = "Error: " + error.message;
    }
}

function decodeAudioData(audioContext, base64Audio) {
    return new Promise((resolve, reject) => {
        console.time('audioDecode');
        const binaryString = atob(base64Audio);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        audioContext.decodeAudioData(bytes.buffer, 
            (decodedData) => {
                console.timeEnd('audioDecode');
                resolve(decodedData);
            }, 
            (error) => {
                console.timeEnd('audioDecode');
                reject(error);
            }
        );
    });
}

function playDecodedAudio(audioContext, audioBuffer) {
    return new Promise((resolve) => {
        console.time('audioPlayback');
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        
        // Apply playback speed
        const playbackSpeed = 0.9 + (parseFloat(playbackSpeedSlider.value) * 0.1);
        source.playbackRate.value = playbackSpeed;

        source.connect(audioContext.destination);
        source.onended = () => {
            console.timeEnd('audioPlayback');
            resolve();
        };
        source.start(0);
    });
}

// Override tutorController methods to update UI
const originalStart = tutorController.start;
tutorController.start = function() {
    originalStart.call(this);
    statusDisplay.textContent = "Listening for sound...";
};

tutorController.onRecordingComplete = function(result) {
    if (result.discarded) {
        statusDisplay.textContent = `Recording discarded: ${result.reason}. Restarting...`;
        updateInfoWindow(`Recording discarded: ${result.reason}`);
        this.startMonitoring();
    } else {
        processAndPlayAudio(result.audioBlob);
    }
};

// Start monitoring sound levels
let isRecording = false;
setInterval(() => {
    const { average, isSilent } = monitorSound();
    updateSoundLevelDisplay(average, isSilent);
    if (isRecording !== tutorController.isRecording) {
        isRecording = tutorController.isRecording;
        statusDisplay.textContent = isRecording ? "Recording..." : "Monitoring...";
    }
}, 72); // Decreased to 90% of 80ms

// Initialize UI when the page loads
initializeUI();