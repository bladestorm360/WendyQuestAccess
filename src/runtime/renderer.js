'use strict';

const { createGate } = require('./gate');

const MAX_PENDING = 8;
const ARRIVAL_FOLLOWUP_MS = 2500;
const FIELD_FOLLOWUP = new Set(['interactionPrompt', 'mapBanner', 'questFocus', 'treasureReward', 'dialoguePage']);

function createRenderer(host, waitForSpeechPreference = false) {
    let gate = null;
    let word = null;
    let worker = null;
    let failed = false;
    let scheduled = false;
    let inFlight = 0;
    let nextSequence = 0;
    let nextContext = 0;
    let context = 0;
    let isPresented = null;
    let speechEnabled = waitForSpeechPreference ? null : true;
    let brailleAvailable = true;
    let outputStarted = false;
    let arrival = null;
    const pending = [];
    // Confirmed NVDA captions and their automatic followups contain only
    // copied display records. Keep at most the existing eight outstanding
    // records, and retry only a provider-rejected packet after native readiness.
    let descriptions = false;
    const descriptionFlights = new Map();
    const counters = { dropped: 0, discarded: 0, submitted: 0, silenced: 0, silenceUnavailable: 0, workerFailures: 0 };

    function workerFailed() {
        if (failed) return;
        failed = true;
        counters.workerFailures++;
        pending.length = 0;descriptionFlights.clear();
        descriptions=false;host.descriptionFlowChanged?.(false);
        if (gate) gate.close();
        // Feature observers keep their context and review even if output fails.
    }

    function drain() {
        // Resolve every old-epoch receipt before replaying: a caption that
        // lost admission must precede text from the newly presented scene.
        if([...descriptionFlights.values()].some(entry=>entry.epoch!==gate?.epoch))return;
        while (worker && gate?.domain === 'frontend' && inFlight < MAX_PENDING && pending.length) {
            const { continueOutput, ...record } = pending.shift();
            try {
                // A retained logical context can begin a fresh transport
                // sequence after mute. Its first record has no prior output.
                if (!outputStarted && record.append && !continueOutput) record.append = false;
                if(record.preserveDescription)descriptionFlights.set(record.sequence,{record:{...record,continueOutput:true},epoch:gate.epoch,keep:descriptions});
                worker.postMessage({ ...record, epoch: gate.epoch, ...(speechEnabled ? {} : { brailleOnly: true }) });
                outputStarted = true;
                inFlight++;
            } catch {
                workerFailed();
            }
        }
    }

    function start() {
        scheduled = false;
        if (failed || worker || !pending.length || gate?.domain !== 'frontend') return;
        if (!isPresented?.()) return retireOutput();
        try {
            worker = host.createWorker(word.buffer);
            worker.on('message', message => {
                const receipt=typeof message==='object'&&message?message.status:message;
                if (receipt === 'ack' || receipt === 'discarded') {
                    const retained=typeof message==='object'?descriptionFlights.get(message.sequence):null;
                    if(retained){
                        descriptionFlights.delete(message.sequence);
                        if(receipt==='discarded'&&message.retry===true&&retained.keep&&descriptions){
                            pending.push(retained.record);pending.sort((a,b)=>a.sequence-b.sequence);
                        }
                    }
                    if (inFlight > 0) inFlight--;
                    if (receipt === 'ack') counters.submitted++;
                    else counters.discarded++;
                    drain();
                } else if (message === 'noBraille') {
                    brailleAvailable = false;
                    if (speechEnabled === false) pending.length = 0;
                } else if (message === 'silenced') {
                    counters.silenced++;
                } else if (message === 'silenceUnavailable') {
                    counters.silenceUnavailable++;
                } else if (message === 'failed') {
                    workerFailed();
                }
            });
            worker.on('error', workerFailed);
            worker.on('exit', workerFailed);
            worker.unref();
            drain();
        } catch {
            workerFailed();
        }
    }

    function readyOutput() {
        if (failed || speechEnabled === null || !pending.length) return;
        if (speechEnabled === false && !brailleAvailable) {
            pending.length = 0;
            return;
        }
        if (!gate) {
            try {
                word = host.makeWord();
                gate = createGate(word);
            } catch {
                workerFailed();
                return;
            }
        }
        if (gate.domain !== 'frontend' && !gate.open('frontend')) {
            pending.length = 0;
            return;
        }
        drain();
        if (!worker && !scheduled) {
            scheduled = true;
            host.schedule(start);
        }
    }

    function submit(token, focused, continueOutput = false) {
        if (failed || !context || token !== context || (speechEnabled === false && !brailleAvailable)) return false;
        if (pending.length + inFlight >= MAX_PENDING) {
            counters.dropped++;
            return false;
        }
        pending.push({ kind: 'title', ...focused, continueOutput, sequence: ++nextSequence,
            ...(descriptions&&{append:true,continueOutput:true,preserveDescription:true}) });
        readyOutput();
        return true;
    }

    function retireOutput(preserve=descriptions) {
        if(preserve) {
            for(let i=pending.length-1;i>=0;i--)if(!pending[i].preserveDescription)pending.splice(i,1);
        }else{
            pending.length=0;
            for(const entry of descriptionFlights.values())entry.keep=false;
        }
        outputStarted = false;
        // Publish the invalid epoch before sending a bounded cancellation.
        if (!gate?.close() || !worker || failed) return;
        try { worker.postMessage({ kind: 'cancel' }); }
        catch { workerFailed(); }
    }

    function cancelDescriptions() {
        if(!descriptions)return;
        descriptions=false;host.descriptionFlowChanged?.(false);retireOutput(false);
    }

    function setSpeechEnabled(enabled, maySilence) {
        if (enabled === speechEnabled) return;
        const previous = speechEnabled;
        cancelDescriptions();
        if (!enabled) arrival = null;
        speechEnabled = enabled;
        if (previous === null) {
            if (!isPresented?.()) pending.length = 0;
            readyOutput();
            return;
        }
        retireOutput();
        // Explicit mute may stop a provider that is already open. The worker
        // serializes it with any output call, and settings can retire its grant.
        if (enabled || !worker || failed || !maySilence?.()) return;
        const epoch = gate.open('silence');
        if (!epoch) return;
        try { worker.postMessage({ kind: 'silence', epoch }); }
        catch { workerFailed(); }
    }

    function open(focused, ready = host.titleStillReady, fieldFollowup = false, continuation = false) {
        if (nextContext >= 0x7ffffffe) return 0;
        const append = continuation || descriptions || arrival && host.now() < arrival.expires &&
            (fieldFollowup || FIELD_FOLLOWUP.has(focused.kind));
        // A presented field notice can keep the arrival in the same FIFO.
        // After a native boundary, open a fresh gate and append at the
        // provider to any arrival already admitted before the boundary.
        if (!descriptions&&(!append || !continuation&&!arrival?.ready?.())) retireOutput();
        if (!append) arrival = null;
        const token = context = ++nextContext;
        isPresented = ready;
        submit(token, append ? { ...focused, append: true } : focused, !!append);
        return token;
    }

    function close(token = context) {
        if (!context || token !== context) return;
        context = 0;
        isPresented = null;
        if (gate?.domain !== 'silence') retireOutput();
    }

    const notifications = {
        open,
        // A confirmed route chunk keeps the provider's existing FIFO. Only
        // the readout owner may select this explicit continuation intent.
        continue: (focused,ready) => open(focused,ready,false,true),
        close,
        describe(text,ready) {
            if(speechEnabled!==true||typeof ready!=='function'||!ready())return false;
            descriptions=true;host.descriptionFlowChanged?.(true);
            for(const record of pending)Object.assign(record,{append:true,continueOutput:true,preserveDescription:true});
            if(context&&isPresented?.())return submit(context,{kind:'narrationCaption',text,append:true},true);
            return !!open({kind:'narrationCaption',text,append:true},ready);
        },
        focus: submit,
        current: token => !!context && token === context,
        arrive(focused, ready, walking, detail) {
            if (nextContext >= 0x7ffffffe || !ready()) return 0;
            const followsWalking = !!walking && context === walking;
            if (!followsWalking) retireOutput();
            const token = context = ++nextContext;
            isPresented = ready;
            arrival = { token, ready, expires: host.now() + ARRIVAL_FOLLOWUP_MS };
            submit(token, { ...focused, append: followsWalking });
            if (detail) submit(token, { ...detail, append: true });
            return token;
        },
        endArrival(token, keepOrder) {
            if (arrival?.token !== token) return;
            if (arrival.ready) close();
            if (keepOrder) arrival.ready = null;
            else arrival = null;
        }
    };
    return {
        notifications, counters, setSpeechEnabled, cancelDescriptions,
        pauseDescriptions() {
            if(!descriptions)return false;
            retireOutput(true);context=0;isPresented=null;return true;
        },
        resumeDescriptions(ready) {
            if(!descriptions||!ready?.())return false;
            if(!context){if(nextContext>=0x7ffffffe)return false;context=++nextContext;isPresented=ready;}
            readyOutput();return true;
        },
        retireSilence() { if (gate?.domain === 'silence') retireOutput(); }
    };
}

module.exports = { createRenderer };
