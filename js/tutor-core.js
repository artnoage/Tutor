import { sendAudioToServer } from './api-service.js';
import { bufferToWave } from './audio-utils.js';

// IndexedDB
let db;

const dbName = "TutorChatDB";
const objectStoreName = "chatObjects";

// Initialize IndexedDB
const dbPromise = indexedDB.open(dbName, 1);

dbPromise.onupgradeneeded = function(event) {
    db = event.target.result;
    db.createObjectStore(objectStoreName, { keyPath: "id", autoIncrement: true });
};

dbPromise.onsuccess = function(event) {
    db = event.target.result;
    loadChatObjects(); // Load chat objects when DB is ready
};

dbPromise.onerror = function(event) {
    console.error("IndexedDB error:", event.target.error);
};

// Function to save chat objects to IndexedDB
function saveChatObjects() {
    const transaction = db.transaction([objectStoreName], "readwrite");
    const store = transaction.objectStore(objectStoreName);

    // Clear existing data
    store.clear();

    // Add each chat object
    tutorController.chatObjects.forEach((chatObject, index) => {
        store.add({ ...chatObject, id: index + 1 });
    });
}

// Function to load chat objects from IndexedDB
function loadChatObjects() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([objectStoreName], "readonly");
        const store = transaction.objectStore(objectStoreName);
        const request = store.getAll();

        request.onsuccess = function(event) {
            const loadedChatObjects = event.target.result;
            if (loadedChatObjects.length > 0) {
                tutorController.chatObjects = loadedChatObjects;
                tutorController.currentChatIndex = loadedChatObjects.length - 1;
                if (tutorController.uiCallbacks.onChatObjectsLoaded) {
                    tutorController.uiCallbacks.onChatObjectsLoaded();
                }
            }
            resolve(loadedChatObjects);
        };

        request.onerror = function(event) {
            reject(event.target.error);
        };
    });
}

// Initialize IndexedDB and load chat objects
dbPromise.onsuccess = function(event) {
    db = event.target.result;
    loadChatObjects().then(() => {
        if (tutorController.uiCallbacks.onInitialLoadComplete) {
            tutorController.uiCallbacks.onInitialLoadComplete();
        }
    }).catch(error => {
        console.error("Error loading chat objects:", error);
    });
};

// Global variables
let audioContext;
let analyser;
let dataArray;
let mediaRecorder;
let audioChunks = [];
let stream;
let isMonitoring = false;
let isRecording = false;
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
    chatObjects: [],
    currentChatIndex: -1,
    pauseTime: 1, // Default pause time in seconds
    disableTutor: false, // Tutor enabled by default
    accentIgnore: true, // Default to ignoring accent issues
    pendingProcessingPromise: null,
    speechStartTime: null,
    silenceStartTime: null,

    setFormElements: function(elements) {
        this.formElements = elements;
        // Add the new parameter to formElements
        this.formElements.newParameter = document.getElementById('newParameterInput') || { value: '' };
    },

    setUICallbacks: function(callbacks) {
        this.uiCallbacks = callbacks;
    },

    start: function() {
        console.log('Tutor start method called');
        this.isActive = true;
        this.isRecording = false;
        isProcessing = false;
        if (this.currentChatIndex === -1) {
            this.createNewChat();
        }
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
        stopTutor();
        
        // Cancel any pending operations
        if (this.pendingProcessingPromise) {
            this.pendingProcessingPromise.cancel();
            this.pendingProcessingPromise = null;
        }

        // Reset all recording-related variables
        audioChunks = [];
        this.speechStartTime = null;
        this.silenceStartTime = null;
    },

    createNewChat: function() {
        this.chatObjects.push({
            chat_history: [],
            tutors_comments: [],
            summary: []
        });
        this.currentChatIndex = this.chatObjects.length - 1;
        if (this.uiCallbacks.onChatCreated) {
            this.uiCallbacks.onChatCreated(this.currentChatIndex);
        }
        saveChatObjects(); // Save after creating a new chat
    },

    switchChat: function(index) {
        if (index >= 0 && index < this.chatObjects.length) {
            this.currentChatIndex = index;
            if (this.uiCallbacks.onChatSwitched) {
                this.uiCallbacks.onChatSwitched(this.getCurrentChat());
            }
            saveChatObjects(); // Save after switching chats
        }
    },

    getCurrentChat: function() {
        return this.chatObjects[this.currentChatIndex];
    },

    restartChat: function() {
        console.log('Restarting chat');
        const wasActive = this.isActive;
        if (wasActive) {
            this.stop();
        }
        this.getCurrentChat().chat_history = [];
        this.getCurrentChat().tutors_comments = [];
        this.getCurrentChat().summary = [];
        if (this.uiCallbacks.onChatRestart) {
            this.uiCallbacks.onChatRestart();
        }
        if (wasActive) {
            this.start();
        }
        saveChatObjects(); // Save after restarting chat
    },

    startMonitoring: function() {
        console.log('startMonitoring called');
        this.speechStartTime = null;
        this.silenceStartTime = null;
        
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
                startRecording(); // Start recording immediately
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

    setAccentIgnore: function(ignore) {
        this.accentIgnore = ignore;
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

    async processAndPlayAudio(audioData, sessionTimestamp) {
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
                chatObject: this.getCurrentChat()
            };
    
            if (sessionTimestamp !== currentSessionTimestamp) {
                throw new DOMException('Session changed', 'AbortError');
            }

            // Ensure audioData is a Blob
            const audioBlob = audioData instanceof Blob ? audioData : new Blob([audioData], { type: 'audio/wav' });

            const result = await sendAudioToServer(audioBlob, formElementsWithChat);
            
            if (sessionTimestamp !== currentSessionTimestamp) {
                throw new DOMException('Session changed', 'AbortError');
            }

            console.time('clientProcessing');
            
            // Update the current chat object with the response from the server
            if (result.chatObject) {
                this.chatObjects[this.currentChatIndex] = result.chatObject;
                
                if (this.uiCallbacks.onAPIResponseReceived) {
                    this.uiCallbacks.onAPIResponseReceived(result.chatObject);
                }
            } else {
                console.error('Server response did not include chatObject');
            }
            
            // Decode audio data
            if (result.audio_base64) {
                const audioBuffer = await decodeAudioData(result.audio_base64);
                
                // Play audio
                if (this.uiCallbacks.onAudioPlayStart) {
                    this.uiCallbacks.onAudioPlayStart();
                }
                const playbackSpeed = 0.9 + (parseFloat(this.formElements.playbackSpeedSlider.value) * 0.1);
                await playDecodedAudio(audioBuffer, playbackSpeed);
            } else {
                console.error('Server response did not include audio_base64');
            }
            
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
            const trimmedBlob = await this.trimAudioFromSpeechStart(audioBlob);
            if (trimmedBlob) {
                await this.processAndPlayAudio(trimmedBlob, sessionTimestamp);
            } else {
                console.log('Audio discarded: no speech detected or too short');
                if (this.uiCallbacks.onRecordingDiscarded) {
                    this.uiCallbacks.onRecordingDiscarded("No speech detected or too short");
                }
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                console.log('Audio processing was cancelled');
            } else {
                console.error('Error processing audio:', error);
            }
        } finally {
            isProcessing = false;
            this.pendingProcessingPromise = null;
            this.speechStartTime = null;
            this.silenceStartTime = null;
        }
        
        // Reset for next recording only if the session is still active
        if (this.isActive && currentSessionTimestamp === sessionTimestamp) {
            this.startMonitoring();
            if (this.uiCallbacks.onMonitoringStart) {
                this.uiCallbacks.onMonitoringStart();
            }
        }
    },

    trimAudioFromSpeechStart: async function(audioBlob) {
        if (!this.speechStartTime) {
            return null; // No speech detected
        }

        const audioBuffer = await this.blobToAudioBuffer(audioBlob);
        const recordingStartTime = currentSessionTimestamp;
        const trimStartTime = Math.max(0, this.speechStartTime - recordingStartTime - 300); // 300ms buffer
        const trimStartSample = Math.floor(trimStartTime * audioBuffer.sampleRate / 1000);
        
        if (audioBuffer.length - trimStartSample < audioBuffer.sampleRate * MIN_VALID_DURATION) {
            return null; // Audio too short after trimming
        }

        const trimmedBuffer = audioContext.createBuffer(
            audioBuffer.numberOfChannels,
            audioBuffer.length - trimStartSample,
            audioBuffer.sampleRate
        );

        for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
            const channelData = audioBuffer.getChannelData(channel);
            trimmedBuffer.copyToChannel(channelData.slice(trimStartSample), channel);
        }

        return new Blob([bufferToWave(trimmedBuffer)], {type: 'audio/wav'});
    },

    blobToAudioBuffer: async function(blob) {
        const arrayBuffer = await blob.arrayBuffer();
        return new Promise((resolve, reject) => {
            audioContext.decodeAudioData(arrayBuffer, resolve, reject);
        });
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

    handleSoundState(isSilent);

    return { average, isSilent };
}

function handleSoundState(isSilent) {
    const currentTime = Date.now();

    if (!isSilent) {
        if (!tutorController.speechStartTime) {
            tutorController.speechStartTime = currentTime;
        }
        tutorController.silenceStartTime = null;
    } else {
        if (tutorController.speechStartTime) {
            if (!tutorController.silenceStartTime) {
                tutorController.silenceStartTime = currentTime;
            } else if (currentTime - tutorController.silenceStartTime >= tutorController.pauseTime * 1000) {
                stopRecording().then(result => {
                    tutorController.onRecordingComplete(result);
                });
            }
        }
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
    tutorController.speechStartTime = null;
    tutorController.silenceStartTime = null;
}

async function stopRecording() {
    console.log('Stop recording function called');
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        isRecording = false;
        tutorController.isRecording = false;
        stopMonitoring();
        
        return new Promise((resolve) => {
            mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunks, {type: 'audio/wav'});
                resolve({ discarded: false, audioBlob: audioBlob });
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
    tutorController.speechStartTime = null;
    tutorController.silenceStartTime = null;
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
