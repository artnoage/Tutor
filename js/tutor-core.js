import { sendAudioToServer } from './api-service.js';
import { trimSilence, bufferToWave } from './audio-utils.js';

// Global variables
let audioContext;
let analyser;
let dataArray;
let mediaRecorder;
let audioChunks = [];
let stream;
let isMonitoring = false;
let isRecording = false;
let silenceStartTime = null;
let soundDetectedTime = null;
let currentSessionTimestamp = null;
let isProcessing = false;

// Constants for sound detection
const SILENCE_THRESHOLD = 24;
const SOUND_DETECTION_DURATION = 300; // How long of consecutive sounds before it starts recording
const MIN_VALID_DURATION = 0.6; // How long the audio should be to be send
const MONITOR_TIME_INTERVAL = 20;

const tutorController = {
    isActive: false,
    isRecording: false,
    selectedMicrophoneId: null,
    formElements: null,
    uiCallbacks: null,
    chatObject: null,
    pauseTime: 1, // Default pause time in seconds
    disableTutor: false, // Tutor enabled by default
    pendingProcessingPromise: null,

    setFormElements: function(elements) {
        this.formElements = elements;
    },

    setUICallbacks: function(callbacks) {
        this.uiCallbacks = callbacks;
    },

    start: function() {
        console.log('Tutor start method called');
        this.isActive = true;
        this.isRecording = false;
        isProcessing = false;
        this.chatObject = {
            chat_history: [],
            tutors_comments: [],
            summary: []
        };
        currentSessionTimestamp = Date.now();
        this.startMonitoring();
    },

    stop: async function() {
        console.log('Tutor stop method called');
        const previousTimestamp = currentSessionTimestamp;
        currentSessionTimestamp = null;
        this.isActive = false;
        this.isRecording = false;
        isProcessing = false;
        if (this.isRecording) {
            await this.stopRecording();
        }
        this.chatObject = null;
        stopTutor();
        
        // Cancel any pending operations
        if (this.pendingProcessingPromise) {
            this.pendingProcessingPromise.cancel();
            this.pendingProcessingPromise = null;
        }

        // Reset all recording-related variables
        audioChunks = [];
        silenceStartTime = null;
        soundDetectedTime = null;
    },

    restartChat: function() {
        console.log('Restarting chat');
        const wasActive = this.isActive;
        if (wasActive) {
            this.stop();
        }
        this.chatObject = {
            chat_history: [],
            tutors_comments: [],
            summary: []
        };
        if (this.uiCallbacks.onChatRestart) {
            this.uiCallbacks.onChatRestart();
        }
        if (wasActive) {
            this.start();
        }
    },

    startMonitoring: function() {
        console.log('startMonitoring called');
        soundDetectedTime = null;
        
        const constraints = {
            audio: {
                deviceId: this.selectedMicrophoneId ? {exact: this.selectedMicrophoneId} : undefined
            }
        };

        navigator.mediaDevices.getUserMedia(constraints)
            .then(str => {
                stream = str;
                setupAudioContext();
                startMonitoring();
                if (this.uiCallbacks.onMonitoringStart) {
                    this.uiCallbacks.onMonitoringStart();
                }
            })
            .catch(err => {
                console.error("Error accessing microphone:", err);
                this.stop();
                if (this.uiCallbacks.onError) {
                    this.uiCallbacks.onError("Error accessing microphone: " + err.message);
                }
            });
    },

    setMicrophone: function(deviceId) {
        this.selectedMicrophoneId = deviceId;
    },

    setPauseTime: function(time) {
        this.pauseTime = time;
    },

    setDisableTutor: function(disable) {
        this.disableTutor = disable;
    },

    manualStop: async function() {
        console.log('Manual stop called');
        this.isRecording = false;
        await this.stopRecording();
        stopMonitoring();
        if (this.uiCallbacks.onProcessingStart) {
            this.uiCallbacks.onProcessingStart();
        }
        
        setTimeout(() => {
            this.processAndSendAudio();
        }, this.pauseTime * 900); // Use the pause time set by the user
    },

    stopRecording: async function() {
        console.log('Stop recording called');
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            return new Promise((resolve) => {
                mediaRecorder.onstop = () => {
                    this.isRecording = false;
                    resolve();
                };
                mediaRecorder.stop();
            });
        }
        return Promise.resolve();
    },

    async processAndPlayAudio(audioBlob, sessionTimestamp) {
        console.log('Process and play audio called');
        if (sessionTimestamp !== currentSessionTimestamp) {
            console.log('Ignoring outdated audio processing request');
            return;
        }

        try {
            if (this.uiCallbacks.onProcessingStart) {
                this.uiCallbacks.onProcessingStart();
            }
    
            const formElementsWithChat = {
                ...this.formElements,
                chatObject: this.chatObject
            };
    
            if (sessionTimestamp !== currentSessionTimestamp) {
                throw new DOMException('Session changed', 'AbortError');
            }

            const result = await sendAudioToServer(audioBlob, formElementsWithChat);
            
            if (sessionTimestamp !== currentSessionTimestamp) {
                throw new DOMException('Session changed', 'AbortError');
            }

            console.time('clientProcessing');
            
            // Update chatObject with the response from the server
            this.chatObject = result.chatObject;
            
            if (this.uiCallbacks.onAPIResponseReceived) {
                this.uiCallbacks.onAPIResponseReceived(result);
            }
            
            // Decode audio data
            const audioBuffer = await decodeAudioData(result.audio_base64);
            
            // Play audio
            if (this.uiCallbacks.onAudioPlayStart) {
                this.uiCallbacks.onAudioPlayStart();
            }
            const playbackSpeed = 0.9 + (parseFloat(this.formElements.playbackSpeedSlider.value) * 0.1);
            await playDecodedAudio(audioBuffer, playbackSpeed);
            
            console.timeEnd('clientProcessing');
            
            return { success: true };
        } catch (error) {
            if (error.name === 'AbortError') {
                throw error; // Re-throw AbortError to be caught in processAndSendAudio
            }
            console.error('Error processing or playing audio:', error);
            if (this.uiCallbacks.onError) {
                this.uiCallbacks.onError("Error processing or playing audio: " + error.message);
            }
            return { success: false, error: error.message };
        }
    },

    async onRecordingComplete(result) {
        console.log('Recording complete called');
        if (result.discarded) {
            if (this.uiCallbacks.onRecordingDiscarded) {
                this.uiCallbacks.onRecordingDiscarded(result.reason);
            }
            this.startMonitoring();
        } else {
            const processResult = await this.processAndPlayAudio(result.audioBlob, currentSessionTimestamp);
            
            if (processResult.success) {
                // Resume monitoring after successful audio playback
                if (this.isActive) {
                    this.startMonitoring();
                }
            }
        }
    },

    startMonitoringInterval: function() {
        return setInterval(() => {
            if (this.isActive) {
                const { average, isSilent } = monitorSound();
                if (this.uiCallbacks.onSoundLevelUpdate) {
                    this.uiCallbacks.onSoundLevelUpdate(average, isSilent);
                }
            } else {
                if (this.uiCallbacks.onSoundLevelUpdate) {
                    this.uiCallbacks.onSoundLevelUpdate(null, null);
                }
            }
        }, MONITOR_TIME_INTERVAL); 
    },

    processAndSendAudio: async function() {
        console.log('Process and send audio called');
        if (!this.isActive || isProcessing) {
            console.log('Skipping audio processing: tutor inactive or already processing');
            return;
        }

        isProcessing = true;
        const sessionTimestamp = currentSessionTimestamp;
        const audioBlob = new Blob(audioChunks, {type: 'audio/wav'});
        
        try {
            await this.processAndPlayAudio(audioBlob, sessionTimestamp);
        } catch (error) {
            if (error.name === 'AbortError') {
                console.log('Audio processing was cancelled');
            } else {
                console.error('Error processing audio:', error);
            }
        } finally {
            isProcessing = false;
            this.pendingProcessingPromise = null;
        }
        
        // Reset for next recording only if the session is still active
        if (this.isActive && currentSessionTimestamp === sessionTimestamp) {
            this.startMonitoring();
            if (this.uiCallbacks.onMonitoringStart) {
                this.uiCallbacks.onMonitoringStart();
            }
        }
    }
};

function setupAudioContext() {
    console.log('Setting up audio context');
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);

    analyser.fftSize = 256;
    const bufferLength = analyser.frequencyBinCount;
    dataArray = new Uint8Array(bufferLength);
}

function startMonitoring() {
    console.log('Start monitoring function called');
    isMonitoring = true;
    monitorSound();
}

function monitorSound() {
    if (!isMonitoring || !analyser || !dataArray) {
        return { average: 0, isSilent: true };
    }

    analyser.getByteFrequencyData(dataArray);

    const average = dataArray.reduce((acc, value) => acc + value, 0) / dataArray.length;
    const isSilent = average < SILENCE_THRESHOLD;

    if (!isRecording) {
        handlePreRecordingState(isSilent);
    } else {
        handleRecordingState(isSilent);
    }

    return { average, isSilent };
}

function handlePreRecordingState(isSilent) {
    if (!isSilent) {
        if (!soundDetectedTime) {
            soundDetectedTime = Date.now();
        } else if (Date.now() - soundDetectedTime >= SOUND_DETECTION_DURATION) {
            startRecording();
        }
    } else {
        soundDetectedTime = null;
    }
}

function handleRecordingState(isSilent) {
    if (isSilent) {
        if (!silenceStartTime) {
            silenceStartTime = Date.now();
        } else if (Date.now() - silenceStartTime >= tutorController.pauseTime * 1000) {
            stopRecording().then(result => {
                tutorController.onRecordingComplete(result);
            });
        }
    } else {
        silenceStartTime = null;
    }
}

function startRecording() {
    console.log('Start recording function called');
    isRecording = true;
    tutorController.isRecording = true;
    audioChunks = [];
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = event => {
        audioChunks.push(event.data);
    };
    mediaRecorder.start();
    silenceStartTime = null;
}

async function stopRecording() {
    console.log('Stop recording function called');
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        isRecording = false;
        tutorController.isRecording = false;
        stopMonitoring();
        
        return new Promise((resolve) => {
            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunks, {type: 'audio/wav'});
                const trimmedBlob = await trimSilence(
                    audioBlob, 
                    audioContext, 
                    tutorController.pauseTime, 
                    MIN_VALID_DURATION
                );
                if (trimmedBlob === null) {
                    resolve({ discarded: true, reason: "Recording too short" });
                } else {
                    resolve({ discarded: false, audioBlob: trimmedBlob });
                }
            };
        });
    }
    return Promise.resolve({ discarded: true, reason: "No active recording" });
}

function stopMonitoring() {
    console.log('Stop monitoring function called');
    isMonitoring = false;
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }
}

function stopTutor() {
    console.log('Stop tutor function called');
    stopMonitoring();
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
    if (audioContext) {
        audioContext.close();
        audioContext = null;
    }
    isRecording = false;
    isProcessing = false;
    audioChunks = [];
    silenceStartTime = null;
    soundDetectedTime = null;
}

function decodeAudioData(base64Audio) {
    return new Promise((resolve, reject) => {
        const binaryString = atob(base64Audio);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        audioContext.decodeAudioData(bytes.buffer, resolve, reject);
    });
}

function playDecodedAudio(audioBuffer, playbackSpeed) {
    return new Promise((resolve) => {
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.playbackRate.value = playbackSpeed;
        source.connect(audioContext.destination);
        source.onended = resolve;
        source.start(0);
    });
}

// Update the Promise polyfill to include a cancel method
Promise.prototype.cancel = function() {
    if (this.cancel) {
        this.cancel();
    }
};

export { 
    tutorController, 
    decodeAudioData, 
    playDecodedAudio
};
