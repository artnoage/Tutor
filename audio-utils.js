// audio-utils.js

/**
 * Trims silence from the end of an audio blob.
 * @param {Blob} audioBlob - The audio blob to trim.
 * @param {AudioContext} audioContext - The audio context to use for processing.
 * @param {number} silenceDuration - The duration of silence to trim in seconds.
 * @param {number} minValidDuration - The minimum valid duration for a recording in seconds.
 * @returns {Promise<Blob|null>} A promise that resolves to the trimmed audio blob, or null if the audio is too short.
 */
export async function trimSilence(audioBlob, audioContext, silenceDuration, minValidDuration) {
    const audioBuffer = await audioBlob.arrayBuffer()
        .then(arrayBuffer => audioContext.decodeAudioData(arrayBuffer));

    const numberOfChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const trimmedLength = audioBuffer.length - sampleRate * silenceDuration;

    // Check if the trimmed audio is too short
    if (trimmedLength / sampleRate <= minValidDuration) {
        return null; // Return null for too short recordings
    }

    const trimmedBuffer = audioContext.createBuffer(
        numberOfChannels,
        trimmedLength,
        sampleRate
    );

    for (let channel = 0; channel < numberOfChannels; channel++) {
        const channelData = audioBuffer.getChannelData(channel);
        trimmedBuffer.copyToChannel(channelData.slice(0, trimmedLength), channel);
    }

    return new Promise(resolve => {
        const offlineContext = new OfflineAudioContext(
            numberOfChannels,
            trimmedLength,
            sampleRate
        );
        const source = offlineContext.createBufferSource();
        source.buffer = trimmedBuffer;
        source.connect(offlineContext.destination);
        source.start();
        offlineContext.startRendering().then(renderedBuffer => {
            const trimmedBlob = bufferToWave(renderedBuffer, trimmedLength);
            resolve(trimmedBlob);
        });
    });
}

/**
 * Converts an audio buffer to a WAV file blob.
 * @param {AudioBuffer} abuffer - The audio buffer to convert.
 * @param {number} len - The length of the audio in samples.
 * @returns {Blob} A blob containing the WAV file data.
 */
export function bufferToWave(abuffer, len) {
    const numOfChan = abuffer.numberOfChannels;
    const length = len * numOfChan * 2 + 44;
    const buffer = new ArrayBuffer(length);
    const view = new DataView(buffer);
    let pos = 0;
    const channels = [];
    let i, sample;

    // write WAVE header
    setUint32(0x46464952);                         // "RIFF"
    setUint32(length - 8);                         // file length - 8
    setUint32(0x45564157);                         // "WAVE"

    setUint32(0x20746d66);                         // "fmt " chunk
    setUint32(16);                                 // length = 16
    setUint16(1);                                  // PCM (uncompressed)
    setUint16(numOfChan);
    setUint32(abuffer.sampleRate);
    setUint32(abuffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
    setUint16(numOfChan * 2);                      // block-align
    setUint16(16);                                 // 16-bit (hardcoded in this demo)

    setUint32(0x61746164);                         // "data" - chunk
    setUint32(length - pos - 4);                   // chunk length

    // write interleaved data
    for(i = 0; i < abuffer.numberOfChannels; i++)
        channels.push(abuffer.getChannelData(i));

    for(let sample = 0; sample < len; sample++) {
        for(i = 0; i < numOfChan; i++) {             // interleave channels
            let val = Math.max(-1, Math.min(1, channels[i][sample])); // clamp
            val = (0.5 + val < 0 ? val * 32768 : val * 32767)|0; // scale to 16-bit signed int
            setUint16(val);
        }
    }

    // create Blob
    return new Blob([buffer], {type: "audio/wav"});

    function setUint16(data) {
        view.setUint16(pos, data, true);
        pos += 2;
    }

    function setUint32(data) {
        view.setUint32(pos, data, true);
        pos += 4;
    }
}