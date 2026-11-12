'use strict';

// This database belongs to the NW browser profile. It uses no game save,
// credentials, working-directory file or synchronous storage operation.
function openSettings(indexedDB) {
    return new Promise((resolve, reject) => {
        if (!indexedDB) return reject(Error('Settings storage unavailable'));
        const request = indexedDB.open('wendyquest-access', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('preferences');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const database = request.result;
            database.onversionchange = () => database.close();
            resolve({
                read() {
                    return new Promise((read, failed) => {
                        const entry = database.transaction('preferences').objectStore('preferences').get('keyboard');
                        entry.onsuccess = () => read(entry.result);
                        entry.onerror = () => failed(entry.error);
                    });
                },
                save(value) {
                    return new Promise((saved, failed) => {
                        const transaction = database.transaction('preferences', 'readwrite');
                        transaction.oncomplete = () => saved();
                        transaction.onabort = () => failed(transaction.error);
                        transaction.objectStore('preferences').put(value, 'keyboard');
                    });
                }
            });
        };
    });
}

module.exports = { openSettings };
