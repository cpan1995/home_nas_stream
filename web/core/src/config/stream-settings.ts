import { streamDefaults } from './stream-settings.generated.js';

export function streamSetting(name: string): string {
    const value = process.env[name] ?? streamDefaults[name];
    if (!value) throw new Error(`Missing stream setting: ${name}`);

    if (process.env[name] !== undefined) {
        let url: URL;
        try {
            url = new URL(value);
        } catch {
            throw new Error(`Invalid stream setting: ${name}`);
        }
        if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
            throw new Error(`Invalid stream setting: ${name}`);
        }
    }

    return value;
}
