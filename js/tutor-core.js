import { AudioManager } from './audio-manager.js';
import { sendAudioToServer } from './api-service.js';
import { debugPrintChats } from './tutor-ui-helpers.js';

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
    }

    async initDatabase() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(dbName, 1);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                db.createObjectStore(objectStoreName, { keyPath: "timestamp" });
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                this.loadChatObjects().then(() => {
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
        await this.dbPromise;
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([objectStoreName], "readwrite");
            const store = transaction.objectStore(objectStoreName);

            store.clear();

            let lastRequestPromise = Promise.resolve();

            this.chatObjects.forEach((chatObject) => {
                lastRequestPromise = new Promise((resolve) => {
                    // Ensure timestamp is included when saving
                    const chatToSave = { ...chatObject, timestamp: chatObject.timestamp || Date.now() };
                    const request = store.add(chatToSave);
                    request.onsuccess = resolve;
                });
            });

            lastRequestPromise.then(() => {
                console.log('Chat objects saved:', this.chatObjects);
                console.log('Current chat timestamp after saving:', this.currentChatTimestamp);
                resolve();
            }).catch(reject);
        });
    }

    async loadChatObjects() {
        await this.dbPromise;
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([objectStoreName], "readonly");
            const store = transaction.objectStore(objectStoreName);
            const request = store.getAll();

            request.onsuccess = (event) => {
                const loadedChatObjects = event.target.result;
                if (loadedChatObjects.length > 0) {
                    this.chatObjects = loadedChatObjects.map(chat => ({
                        ...chat,
                        timestamp: chat.timestamp || Date.now() // Ensure timestamp exists
                    }));
                    this.currentChatTimestamp = this.chatObjects[this.chatObjects.length - 1].timestamp;
                }
                console.log('Chat objects loaded:', this.chatObjects);
                console.log('Current chat timestamp after loading:', this.currentChatTimestamp);
                if (this.uiCallbacks && this.uiCallbacks.onChatObjectsLoaded) {
                    this.uiCallbacks.onChatObjectsLoaded();
                }
                resolve(this.chatObjects);
            };

            request.onerror = (event) => {
                reject(event.target.error);
            };
        });
    }

    setFormElements(elements) {
        this.formElements = elements;
    }

    setUICallbacks(callbacks) {
        this.uiCallbacks = callbacks;
    }

    async createNewChat() {
        if (this.chatObjects.length > 0) {
            const lastChat = this.chatObjects[this.chatObjects.length - 1];
            const isEmptyChat = 
                lastChat.chat_history.length === 0 &&
                lastChat.tutors_comments.length === 0 &&
                lastChat.summary.length === 0;

            if (isEmptyChat) {
                if (this.uiCallbacks.onInfoUpdate) {
                    this.uiCallbacks.onInfoUpdate("The last chat is empty. Please use it instead of creating a new one.");
                }
                return null;
            }
        }

        const newChat = {
            chat_history: [],
            tutors_comments: [],
            summary: [],
            timestamp: Date.now()
        };
        this.chatObjects.push(newChat);
        this.currentChatTimestamp = newChat.timestamp;
        await this.saveChatObjects();
        console.log('New chat created:', newChat);
        console.log('Current chat timestamp after creation:', this.currentChatTimestamp);
        
        debugPrintChats(this.chatObjects);
        
        if (this.uiCallbacks.onChatCreated) {
            this.uiCallbacks.onChatCreated(newChat.timestamp);
        }
        return newChat;
    }

    start() {
        console.log('Tutor start method called');
        this.isActive = true;
        if (this.chatObjects.length === 0) {
            this.createNewChat();
        }
        this.audioManager.start(this.onRecordingComplete.bind(this));
    }

    async stop() {
        console.log('Tutor stop method called');
        this.isActive = false;
        await this.audioManager.stop();
        
        if (this.pendingProcessingPromise) {
            this.pendingProcessingPromise.cancel();
            this.pendingProcessingPromise = null;
        }
    }

    switchChat(timestamp) {
        console.log('Switching to chat with timestamp:', timestamp);
        const chat = this.chatObjects.find(chat => chat.timestamp === timestamp);
        if (chat) {
            this.currentChatTimestamp = timestamp;
            console.log('Switched to chat:', chat);
            if (this.uiCallbacks.onChatSwitched) {
                this.uiCallbacks.onChatSwitched(chat);
            }
        } else {
            console.error('Attempted to switch to non-existent chat:', timestamp);
        }
    }

    getCurrentChat() {
        console.log('Getting current chat. Current timestamp:', this.currentChatTimestamp);
        const currentChat = this.chatObjects.find(chat => chat.timestamp === this.currentChatTimestamp);
        if (!currentChat) {
            console.error('No current chat found for timestamp:', this.currentChatTimestamp);
            console.log('All chat objects:', JSON.stringify(this.chatObjects, null, 2));
        }
        return currentChat || null;
    }

    setMicrophone(deviceId) {
        this.audioManager.setMicrophone(deviceId);
    }

    setPauseTime(time) {
        this.pauseTime = time;
        this.audioManager.setPauseTime(time);
    }

    setDisableTutor(disable) {
        this.disableTutor = disable;
    }

    setAccentIgnore(ignore) {
        this.accentIgnore = ignore;
    }

    async manualStop() {
        console.log('Manual stop called');
        await this.audioManager.manualStop();
        if (this.uiCallbacks.onProcessingStart) {
            this.uiCallbacks.onProcessingStart();
        }
    }

    async processAndPlayAudio(audioData) {
        console.log('Process and play audio called');
        console.log('Current chat timestamp:', this.currentChatTimestamp);

        try {
            if (this.uiCallbacks.onProcessingStart) {
                this.uiCallbacks.onProcessingStart();
            }

            const currentChat = this.getCurrentChat();
            console.log('Current chat before API call:', JSON.stringify(currentChat, null, 2));

            if (!currentChat) {
                console.error('No current chat found');
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

            console.log('Form elements with chat being sent:', JSON.stringify(formElementsWithChat, null, 2));

            const result = await sendAudioToServer(audioData, formElementsWithChat);
            
            console.log('Server response:', JSON.stringify(result, null, 2));

            if (result.chatObject) {
                console.log('Received chat object from server:', JSON.stringify(result.chatObject, null, 2));
                const index = this.chatObjects.findIndex(chat => chat.timestamp === this.currentChatTimestamp);
                if (index !== -1) {
                    this.chatObjects[index] = {
                        ...result.chatObject,
                        timestamp: this.currentChatTimestamp // Ensure we keep the original timestamp
                    };
                    console.log('Updated chat object:', JSON.stringify(this.chatObjects[index], null, 2));
                    await this.saveChatObjects();  // Save after updating
                } else {
                    console.error('Could not find chat object to update');
                }
                
                if (this.uiCallbacks.onAPIResponseReceived) {
                    this.uiCallbacks.onAPIResponseReceived(result.chatObject);
                }
            } else {
                console.error('Server response did not include chatObject');
            }
            
            if (result.audio_base64) {
                if (this.uiCallbacks.onAudioPlayStart) {
                    this.uiCallbacks.onAudioPlayStart();
                }
                const playbackSpeed = 0.9 + (parseFloat(this.formElements.playbackSpeedSlider.value) * 0.1);
                await this.audioManager.playAudio(result.audio_base64, playbackSpeed);
            } else {
                console.error('Server response did not include audio_base64');
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
        console.log('Recording complete called');
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
        return this.audioManager.startMonitoringInterval((average, isSilent) => {
            if (this.uiCallbacks.onSoundLevelUpdate) {
                this.uiCallbacks.onSoundLevelUpdate(average, isSilent);
            }
        });
    }
}

export const tutorController = new TutorController();