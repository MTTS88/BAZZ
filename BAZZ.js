const { Client, Util } = require("discord.js");
const YouTube = require('simple-youtube-api');
const ytdl = require('ytdl-core');
const GOOGLE_API_KEY = "AIzaSyCcOHGZ5WMd162u1ptFcTn45WXn2U39loM";
const PREFIX = "-";
const client = new Client( { disableEveryone: true});
const youtube = new YouTube(GOOGLE_API_KEY);
const queue = new Map();

client.on('warn', console.warn);

client.on('error', console.error);

client.on('ready', () => console.log('Ready!'));

client.on('disconnect', () => console.log('I just disconnected, making sure you know, I will reconnect now...'));

client.on('reconnecting', () => console.log('I am reconnecting now!'));

client.on('message', async msg =>{
    if(msg.author.bot) return undefined;
    if(!msg.content.startsWith(PREFIX)) return undefined;
    const args = msg.content.split(' ');
    const searchString = args.slice(1).join(' ');
    const url = args[1] ? args[1].replace(/<(.+)>/g, '$1') : '';
    const serverQueue = queue.get(msg.guild.id);

    if(msg.content.startsWith(`${PREFIX}play`)){
        const voiceChannel = msg.member.voiceChannel;
        if(!voiceChannel) return msg.channel.send('I\'m sorry but you need to be in a voice channel to play music!');
        const permissions = voiceChannel.permissionsFor(msg.client.user);
        if(!permissions.has('CONNECT')){
            return msg.channel.send('I cannot connect to your voice channel. Make sure I have the proper permissions!');
        }
        if(!permissions.has('SPEAK')){
            return msg.channel.send('I cannot speak in this voice channel. Make sure I have the proper permissions!');
        }
        try{
            var video = await youtube.getVideo(url);
        }catch(error){
            try{
                var videos = await youtube.searchVideos(searchString, 10);
                let index = 0;
                msg.channel.send(`
 __**Song selection:**__
                
${videos.map(video2 => `**${++index}-** ${video2.title}`).join('\n')}

Please provide a value to select one of the search results (1-10).
                `);
                
                try {
                    var response = await msg.channel.awaitMessages(msg2 => msg2.content > 0 && msg2.content < 11, {
                        maxMatches: 1,
                        time: 10000,
                        errors: ['time']
                    });
                } catch (err) {
                    console.error(err);
                    return msg.channel.send('No or invalid value entered, canceling video selection..');
                }
                const videoIndex = parseInt(response.first().content);
                var video = await youtube.getVideoByID(videos[videoIndex - 1].id);
            } catch(err){
                console.error(err);
                return msg.channel.send('Video not found.');
            }
        }
        console.log(video);
        const song = {
            id: video.id,
            title: Util.escapeMarkdown(video.title),
            url: `https://www.youtube.com/watch?v=${video.id}`
        };
        if(!serverQueue){
            const queueConstruct = {
                textChannel: msg.channel,
                voiceChannel: voiceChannel,
                connection: null,
                songs: [],
                volume: 5,
                playing: true
            };
            queue.set(msg.guild.id, queueConstruct);
            
            queueConstruct.songs.push(song);

            try {
                var connection = await voiceChannel.join();
                queueConstruct.connection = connection;
                play(msg.guild, queueConstruct.songs[0]);
            } catch(error){
                console.error(`I could not join the voice channel: ${error}`);
                queue.delete(msg.guild.id);
                return msg.channel.send('I could not join the voice channel.');
            }

        } else {
            serverQueue.songs.push(song);
            console.log(serverQueue.songs);
            return msg.channel.send(`**${song.title}** has been added to the queue!`);
        }

        return undefined;
        
    } else if(msg.content.startsWith(`${PREFIX}skip`)){
        if(!msg.member.voiceChannel) return msg.channel.send('You are not in a voice channel!');
        if(!serverQueue) return msg.channel.send('There is nothing playing that I could skip for you.');
        serverQueue.connection.dispatcher.end();
        return undefined;

    } else if(msg.content.startsWith(`${PREFIX}stop`)){
        if(!msg.member.voiceChannel) return msg.channel.send('You are not in a voice channel!');
        if(!serverQueue) return msg.channel.send('There is nothing playing that I could stop for you.');
        serverQueue.songs = [];
        serverQueue.connection.dispatcher.end();
        return msg.channel.send('Leaving the voice channel..');
    } else if(msg.content.startsWith(`${PREFIX}pause`)){
        if(!msg.member.voiceChannel) return msg.channel.send('You are not in a voice channel!');
        if(serverQueue && !serverQueue.playing) return msg.channel.send('Music is already paused!');
        if(serverQueue && serverQueue.playing){
            serverQueue.playing = false;
            serverQueue.connection.dispatcher.pause();
            return msg.channel.send('Paused the music for you!');
        } 
        return msg.channel.send('There is nothing playing at the moment.');
        
    } else if(msg.content.startsWith(`${PREFIX}resume`)){
        if(!msg.member.voiceChannel) return msg.channel.send('You are not in a voice channel!');
        if(serverQueue && serverQueue.playing) return msg.channel.send('Music is already playing!');
        if(serverQueue && !serverQueue.playing){
            serverQueue.playing = true;
            serverQueue.connection.dispatcher.resume();
            return msg.channel.send('Resumed the music for you!');
        } 
        return msg.channel.send('There is nothing playing at the moment.');
        
    } else if(msg.content.startsWith(`${PREFIX}np`)){
        if(!serverQueue) return msg.channel.send('There is nothing playing at the moment.');
        return msg.channel.send(`Now playing: **${serverQueue.songs[0].title}**`);
    } else if(msg.content.startsWith(`${PREFIX}volume`)){
        if(!serverQueue) return msg.channel.send('There is nothing playing at the moment.');
        if(!msg.member.voiceChannel) return msg.channel.send('You are not in a voice channel!');
        if(!args[1]) return msg.channel.send(`The current volume is: **${serverQueue.volume}**`);
        serverQueue.volume = args[1];
        serverQueue.connection.dispatcher.setVolumeLogarithmic(args[1] / 5);
        return msg.channel.send(`${msg.author} changed the volume to **${args[1]}**`);
    } else if(msg.content.startsWith(`${PREFIX}queue`)){
        if(!serverQueue) return msg.channel.send('There is nothing playing at the moment.');
        return msg.channel.send(`
__**Song queue:**__
${serverQueue.songs.map(song => `**-** ${song.title}`).join('\n')}

**Now playing:** ${serverQueue.songs[0].title}
        `);
    } 
    return undefined;
});

function play(guild, song){
    const serverQueue = queue.get(guild.id);
    
    if(!song){
        serverQueue.voiceChannel.leave();
        queue.delete(guild.id);
        return;
    }
    console.log(serverQueue.songs);

    const dispatcher = serverQueue.connection.playStream(ytdl(song.url))
        .on('end', () => {
            console.log('Song ended!');
            serverQueue.songs.shift();
            play(guild, serverQueue.songs[0]);
        })
        .on('error', error => console.error(error));
    dispatcher.setVolumeLogarithmic(serverQueue.volume / 5);

    serverQueue.textChannel.send(`Start playing: **${song.title}**`);
}

client.login(process.env.BOT_TOKEN);
