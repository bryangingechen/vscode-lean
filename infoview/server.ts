import { Server, Transport, Connection, Event, TransportError } from 'lean-client-js-core';
import { ToInfoviewMessage, FromInfoviewMessage, Config, Location, defaultConfig } from '../src/shared';
import { SignalBuilder, Signal } from './util';
declare const acquireVsCodeApi;
const vscode = acquireVsCodeApi();

export function post(message: FromInfoviewMessage) { // send a message to the extension
    vscode.postMessage(message);
}

export const PositionEvent: Event<Location> = new Event();
const InnerConfigEvent: Event<Partial<Config>> = new Event();
export const ConfigEvent: Signal<Config> = (new SignalBuilder()).scan((acc, x) => ({...acc, ...x}), defaultConfig, InnerConfigEvent);
export const SyncPinEvent: Event<{pins: Location[]}> = new Event();
export const PauseEvent: Event<{}> = new Event();
export const ContinueEvent: Event<{}> = new Event();
export const ToggleUpdatingEvent: Event<{}> = new Event();
export const CopyToCommentEvent: Event<{}> = new Event();
export const TogglePinEvent: Event<{}> = new Event();
export const ServerRestartEvent: Event<{}> = new Event();

window.addEventListener('message', event => { // messages from the extension
    const message: ToInfoviewMessage = event.data; // The JSON data our extension sent
    switch (message.command) {
        case 'position': PositionEvent.fire(message.loc); break;
        case 'on_config_change': InnerConfigEvent.fire(message.config); break;
        case 'sync_pin': SyncPinEvent.fire(message); break;
        case 'pause': PauseEvent.fire(message); break;
        case 'continue': ContinueEvent.fire(message); break;
        case 'toggle_updating': ToggleUpdatingEvent.fire(message); break;
        case 'copy_to_comment': CopyToCommentEvent.fire(message); break;
        case 'toggle_pin': TogglePinEvent.fire(message); break;
        case 'restart': ServerRestartEvent.fire(message); break;
        case 'server_event': break;
        case 'server_error': break;
    }
});

class ProxyTransport implements Transport {
    connect(): Connection {
        return new ProxyConnectionClient();
    }
    constructor() { }
}

/** Forwards all of the messages between extension and webview.
 * See also makeProxyTransport on the server.
 */
class ProxyConnectionClient implements Connection {
    error: Event<TransportError>;
    jsonMessage: Event<any>;
    alive: boolean;
    messageListener;
    send(jsonMsg: any) {
        post({
            command: 'server_request',
            payload: JSON.stringify(jsonMsg),
        })
    }
    dispose() {
        this.jsonMessage.dispose();
        this.error.dispose();
        this.alive = false;
        window.removeEventListener('message', this.messageListener);
    }
    constructor() {
        this.alive = true;
        this.jsonMessage = new Event();
        this.error = new Event();
        this.messageListener = event => { // messages from the extension
            const message: ToInfoviewMessage = event.data; // The JSON data our extension sent
            // console.log('incoming:', message);
            switch (message.command) {
                case 'server_event': {
                    const payload = JSON.parse(message.payload);
                    this.jsonMessage.fire(payload);
                    break;
                }
                case 'server_error': {
                    const payload = JSON.parse(message.payload);
                    this.error.fire(payload);
                    break;
                }
            }
        };
        window.addEventListener('message', this.messageListener);
    }
}

export const global_server = new Server(new ProxyTransport());
global_server.logMessagesToConsole = true;
global_server.connect();