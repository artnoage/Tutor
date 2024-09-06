import { AudioManager } from './audio-manager.js';
import { sendAudioToServer, generateChatName } from './api-service.js';

const dbName = "TutorChatDB";
const objectStoreName = "chatObjects";

class TutorController {
    constructor() {
        this.isActive = false;
        this.formElements = null;
        this.uiCallbacks = null;
        this.chatObjects = [];
        this.currentChatTimestamp = null;
        this.pauseTime = 1;
        this.disableTutor = false;
        this.accentIgnore = true;
        this.pendingProcessingPromise = null;
        this.audioManager = new AudioManager();
        this.dbPromise = this.initDatabase();
        this.isInitialized = false;
    }

    async initDatabase() {
        /**
         * Initializes the IndexedDB database for storing chat objects.
         * @returns {Promise} A promise that resolves when the database is initialized.
         */
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(dbName, 1);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(objectStoreName)) {
                    db.createObjectStore(objectStoreName, { keyPath: "timestamp" });
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                this.loadChatObjects().then(() => {
                    this.isInitialized = true;
                    if (this.uiCallbacks && this.uiCallbacks.onInitialLoadComplete) {
                        this.uiCallbacks.onInitialLoadComplete();
                    }
                });
                resolve();
            };

            request.onerror = (event) => {
                console.error("IndexedDB error:", event.target.error);
                reject(event.target.error);
            };
        });
    }

    async saveChatObjects() {
        /**
         * Saves the current chat objects to the IndexedDB database.
         * @returns {Promise} A promise that resolves when the save operation is complete.
         */
        await this.dbPromise;
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([objectStoreName], "readwrite");
            const store = transaction.objectStore(objectStoreName);

            const clearRequest = store.clear();
            clearRequest.onsuccess = () => {
                this.chatObjects.forEach((chatObject) => {
                    store.add(chatObject);
                });
            };

            transaction.oncomplete = () => resolve();
            transaction.onerror = (event) => reject(event.target.error);
        });
    }

    async loadChatObjects() {
        /**
         * Loads chat objects from the IndexedDB database.
         * @returns {Promise} A promise that resolves with the loaded chat objects.
         */
        await this.dbPromise;
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([objectStoreName], "readonly");
            const store = transaction.objectStore(objectStoreName);
            const request = store.getAll();

            request.onsuccess = (event) => {
                const loadedChatObjects = event.target.result;
                if (loadedChatObjects.length > 0) {
                    this.chatObjects = loadedChatObjects;
                    this.currentChatTimestamp = this.chatObjects[this.chatObjects.length - 1].timestamp;
                }
                if (this.uiCallbacks && this.uiCallbacks.onChatObjectsLoaded) {
                    this.uiCallbacks.onChatObjectsLoaded();
                }
                resolve(this.chatObjects);
            };

            request.onerror = (event) => reject(event.target.error);
        });
    }

    setFormElements(elements) {
        /**
         * Sets the form elements used in the tutor interface.
         * @param {Object} elements - An object containing references to form elements.
         */
        this.formElements = elements;
    }

    setUICallbacks(callbacks) {
        /**
         * Sets the callback functions for UI updates.
         * @param {Object} callbacks - An object containing callback functions.
         */
        this.uiCallbacks = callbacks;
    }

    async createNewChat() {
        /**
         * Creates a new chat object and adds it to the chat list.
         * @returns {Object|null} The newly created chat object, or null if creation was not possible.
         */
        if (!this.isInitialized) {
            await this.dbPromise;
        }

        const newChatTemplate = {
            chat_history: [],
            tutors_comments: [],
            summary: [],
            timestamp: Date.now(),
            name: ''
        };

        if (this.chatObjects.length > 0) {
            // Sort chats by timestamp to ensure we're working with the most recent
            this.chatObjects.sort((a, b) => b.timestamp - a.timestamp);
            const lastChat = this.chatObjects[0];
            const isEmptyChat = lastChat.chat_history.length === 0 && lastChat.tutors_comments.length === 0;

            if (isEmptyChat) {
                if (this.uiCallbacks.onInfoUpdate) {
                    this.uiCallbacks.onInfoUpdate("The last chat is empty. Please use it instead of creating a new one.");
                }
                return null;
            }

            // Rename the previous chat
            const lastSummary = lastChat.summary[lastChat.summary.length - 1];
            const isEmptySummary = !lastSummary || lastSummary.trim() === '';

            if (isEmptySummary) {
                lastChat.name = "Empty Chat";
            } else {
                try {
                    const formElementsForChatName = {
                        chatObject: lastChat,
                        modelSelect: { value: this.model },
                        tutoringLanguageSelect: { value: this.tutoringLanguage }
                    };
                    lastChat.name = await generateChatName(formElementsForChatName);
                } catch (error) {
                    console.error('Error generating chat name:', error);
                    lastChat.name = `Chat ${new Date(lastChat.timestamp).toLocaleString()}`;
                }
            }
            await this.saveChatObjects();
        }

        const newChat = { ...newChatTemplate };
        this.chatObjects.push(newChat);
        this.currentChatTimestamp = newChat.timestamp;
        await this.saveChatObjects();
        
        if (this.uiCallbacks.onChatCreated) {
            this.uiCallbacks.onChatCreated(newChat.timestamp);
        }
        return newChat;
    }

    async start() {
        /**
         * Starts the tutor session.
         */
        this.isActive = true;
        await this.dbPromise;
        if (this.chatObjects.length === 0) {
            await this.createNewChat();
        }
        this.audioManager.start(this.onRecordingComplete.bind(this));
    }

    async stop() {
        /**
         * Stops the tutor session.
         */
        this.isActive = false;
        await this.audioManager.stop();
        
        if (this.pendingProcessingPromise) {
            this.pendingProcessingPromise.cancel();
            this.pendingProcessingPromise = null;
        }
    }

    switchChat(timestamp) {
        /**
         * Switches to a different chat based on the provided timestamp.
         * @param {number} timestamp - The timestamp of the chat to switch to.
         */
        const chat = this.chatObjects.find(chat => chat.timestamp === timestamp);
        if (chat) {
            this.currentChatTimestamp = timestamp;
            // Sort chats by timestamp after switching
            this.chatObjects.sort((a, b) => b.timestamp - a.timestamp);
            if (this.uiCallbacks.onChatSwitched) {
                this.uiCallbacks.onChatSwitched(chat);
            }
        }
    }

    getCurrentChat() {
        /**
         * Gets the current chat object.
         * @returns {Object|null} The current chat object, or null if not found.
         */
        return this.chatObjects.find(chat => chat.timestamp === this.currentChatTimestamp) || null;
    }

    setMicrophone(deviceId) {
        /**
         * Sets the microphone device to use for audio input.
         * @param {string} deviceId - The ID of the microphone device.
         */
        this.audioManager.setMicrophone(deviceId);
    }

    setPauseTime(time) {
        /**
         * Sets the pause time between audio recordings.
         * @param {number} time - The pause time in seconds.
         */
        this.pauseTime = time;
        this.audioManager.setPauseTime(time);
    }

    setDisableTutor(disable) {
        /**
         * Enables or disables the tutor functionality.
         * @param {boolean} disable - Whether to disable the tutor.
         */
        this.disableTutor = disable;
    }

    setAccentIgnore(ignore) {
        /**
         * Sets whether to ignore accents in speech recognition.
         * @param {boolean} ignore - Whether to ignore accents.
         */
        this.accentIgnore = ignore;
    }

    setTutoringLanguage(language) {
        /**
         * Sets the language being tutored.
         * @param {string} language - The language to tutor.
         */
        this.tutoringLanguage = language;
        // You might want to add additional logic here if needed
    }

    updateTutorsVoice(voice) {
        /**
         * Updates the voice used for the tutor's speech.
         * @param {string} voice - The voice identifier to use.
         */
        this.tutorsVoice = voice;
    }

    updatePartnersVoice(voice) {
        /**
         * Updates the voice used for the partner's speech.
         * @param {string} voice - The voice identifier to use.
         */
        this.partnersVoice = voice;
    }

    updateInterventionLevel(level) {
        /**
         * Updates the intervention level of the tutor.
         * @param {string} level - The intervention level to set.
         */
        this.interventionLevel = level;
    }

    updateModel(model) {
        /**
         * Updates the AI model used for processing.
         * @param {string} model - The model identifier to use.
         */
        this.model = model;
    }

    async manualStop() {
        /**
         * Manually stops the current recording session.
         */
        await this.audioManager.manualStop();
        if (this.uiCallbacks.onProcessingStart) {
            this.uiCallbacks.onProcessingStart();
        }
    }

    async processAndPlayAudio(audioData) {
        /**
         * Processes the recorded audio data and plays the response.
         * @param {Blob} audioData - The audio data to process.
         * @returns {Object} An object indicating the success of the operation.
         */
        try {
            if (this.uiCallbacks.onProcessingStart) {
                this.uiCallbacks.onProcessingStart();
            }

            const currentChat = this.getCurrentChat();
            if (!currentChat) {
                throw new Error('No current chat found');
            }

            const formElementsWithChat = {
                ...this.formElements,
                chatObject: {
                    chat_history: currentChat.chat_history || [],
                    tutors_comments: currentChat.tutors_comments || [],
                    summary: currentChat.summary || [],
                    timestamp: currentChat.timestamp
                }
            };

            const result = await sendAudioToServer(audioData, formElementsWithChat);

            if (result.chatObject) {
                const index = this.chatObjects.findIndex(chat => chat.timestamp === this.currentChatTimestamp);
                if (index !== -1) {
                    this.chatObjects[index] = {
                        ...result.chatObject,
                        timestamp: this.currentChatTimestamp
                    };
                    await this.saveChatObjects();
                }
                
                if (this.uiCallbacks.onAPIResponseReceived) {
                    this.uiCallbacks.onAPIResponseReceived(result.chatObject);
                }
            }
            
            if (result.audio_base64) {
                if (this.uiCallbacks.onAudioPlayStart) {
                    this.uiCallbacks.onAudioPlayStart();
                }
                const playbackSpeed = 0.9 + (parseFloat(this.formElements.playbackSpeedSlider.value) * 0.1);
                await this.audioManager.playAudio(result.audio_base64, playbackSpeed);
            }
            
            return { success: true };
        } catch (error) {
            console.error('Error processing or playing audio:', error);
            if (this.uiCallbacks.onError) {
                this.uiCallbacks.onError("Error processing or playing audio: " + error.message);
            }
            return { success: false, error: error.message };
        }
    }

    async onRecordingComplete(result) {
        /**
         * Handles the completion of an audio recording.
         * @param {Object} result - The result of the recording process.
         */
        if (result.discarded) {
            if (this.uiCallbacks.onRecordingDiscarded) {
                this.uiCallbacks.onRecordingDiscarded(result.reason);
            }
            this.audioManager.startMonitoring();
        } else {
            const processResult = await this.processAndPlayAudio(result.audioBlob);
            
            if (processResult.success && this.isActive) {
                this.audioManager.startMonitoring();
            }
        }
    }

    startMonitoringInterval() {
        /**
         * Starts the interval for monitoring sound levels.
         * @returns {number} The ID of the interval.
         */
        return this.audioManager.startMonitoringInterval((average, isSilent) => {
            if (this.uiCallbacks.onSoundLevelUpdate) {
                this.uiCallbacks.onSoundLevelUpdate(average, isSilent);
            }
        });
    }
}

export const tutorController = new TutorController();
