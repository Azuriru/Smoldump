const got = require('got');
const yargs = require('yargs');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const writeFile = promisify(fs.writeFile);

class Smoldump {
    constructor() {
        this.args = yargs
            .wrap(yargs.terminalWidth())
            .scriptName('smoldump')
            .option('token', {
                alias: 't',
                type: 'string',
                desc: 'User token',
                demand: 'We need an user token to authenticate our requests!',
            })
            .option('channel', {
                alias: 'c',
                type: 'string',
                desc: 'Channel ID',
                // default: '238354899291734017',
                demand: 'We need a channel to log from!',
            })
            .option('start', {
                alias: 's',
                type: 'string',
                desc: 'ID to start from',
                demand: 'We need to know where to start!'
            })
            .option('end', {
                alias: 'e',
                type: 'string',
                desc: 'ID to end from',
                demand: 'We need to know where to end!'
            })
            .option('format', {
                alias: 'f',
                type: 'string',
                desc: 'Format to use, must be `json`, `text`, or `log`',
                default: 'text',
                choices: ['json', 'text', 'log']
            })
            .option('dir', {
                type: 'string',
                desc: 'The directory to dump the ranges to'
            })
            .argv;
    }

    fetch(id, after) {
        return got(`https://discordapp.com/api/v6/channels/${id}/messages`, {
            searchParams: {
                limit: 100,
                after
            },
            headers: {
                authorization: this.args.token
            }
        }).json();
    }

    async fetchAllRangeMessages() {
        const channel = BigInt(this.args.channel);
        const before = this.args.end;
        let after = `${BigInt(this.args.start) - 1n}`;

        console.log(`start: ${after}\nend: ${before}`);

        let messages = [];
        while (true) {
            const batch = await this.fetch(channel, after);
            const end = batch.findIndex(message => before >= message.id);

            if (end) {
                messages.unshift(...batch.slice(end));
                break;
            } else {
                messages.unshift(...batch);
            }

            after = messages[0].id; // or messages[messages.length - 1].id
        }

        return messages;
    }

    writeJSONMessages(messages) {
        return JSON.stringify(messages.map(message => {
            const { id, author: { a_id, username }, content, timestamp } = message;

            return {
                id,
                author: {
                    a_id,
                    username
                },
                content,
                timestamp
            }
        }).reverse(), null, 4);
    }

    writeTextMessages(messages) {
        const TIME_UNTIL_BREAK = 1000 * 60 * 8; // 8 minutes until message groups are separated
        const groupMessages = (messages) => {
            let head = [ messages[0] ];
            const groups = [
                head
            ];

            for (let i = 1; i < messages.length; i++) {
                const message = messages[i];
                const previous = head[head.length - 1];

                if (
                    message.author.id !== previous.author.id ||
                    new Date(message.timestamp).getTime() - new Date(previous.timestamp).getTime() > TIME_UNTIL_BREAK
                ) {
                    head = [ message ];
                    groups.push(head);
                } else {
                    head.push(message);
                }
            }

            return groups;
        };

        return groupMessages(messages.reverse()).map(group => {
            const { author: { username }, timestamp: t } = group[0];
            const timestamp = new Date(t);
            const [ date, timestring ] = [ timestamp.toLocaleDateString(), timestamp.toLocaleTimeString() ];
            const content = group.map(message => message.content).join('\n');

            return `${username} - ${date} at ${timestring}\n${content}`;
        }).join('\n\n');
    }

    writeLogMessages(messages) {
        return messages.map(message => {
            const { author: { username }, content, timestamp } = message;

            return `[${new Date(timestamp).toLocaleString()}] ${username}: ${content}`;
        })
            .reverse()
            .join('\n');
    }

    write(messages) {
        switch (this.args.format) {
            case 'json':
                return this.writeJSONMessages(messages);
            case 'text':
                return this.writeTextMessages(messages);
            case 'log':
                return this.writeLogMessages(messages);
        }
    }

    getFilename() {
        switch (this.args.format) {
            case 'json':
                return 'ranges.json';
            case 'text':
                return 'ranges.txt';
            case 'log':
                return 'ranges.txt';
        }
    }

    async export() {
        let dir;
        if (this.args.dir) {
            if (path.isAbsolute(this.args.dir)) {
                dir = this.args.dir;
            } else {
                dir = path.join(__dirname, this.args.dir);
            }
        } else {
            dir = path.join(__dirname, this.getFilename());
        }

        await writeFile(dir, this.write(await this.fetchAllRangeMessages()));

        console.log('Ranges exported!');
    }
}

new Smoldump().export();