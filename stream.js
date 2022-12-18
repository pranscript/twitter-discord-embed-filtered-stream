
//  Quickstart Twitter Sample Code - https://github.com/twitterdev/Twitter-API-v2-sample-code/blob/main/Filtered-Stream/filtered_stream.js 

const needle = require('needle');
const axios = require('axios');
const Client = require('twitter-api-sdk').default;
require('dotenv').config();

const bearerToken = process.env.BEARER_TOKEN;
const webhookURL = process.env.DISCORD_WEBHOOK
const rulesURL = 'https://api.twitter.com/2/tweets/search/stream/rules';
const streamURL = 'https://api.twitter.com/2/tweets/search/stream?expansions=author_id';

const client = new Client(bearerToken);

// Set Rules
const rules = [
    {
        'value': '(mekaverse OR mekagang) -scam -promote -mint -is:reply -is:retweet -is:quote',
        'tag': 'Main Tweet',
    },
    {
        'value': '(mekaverse OR mekagang) -scam -promote -mint is:quote',
        'tag': 'Quote Tweet',
    },
];

// Set color accordingly
const tweetColor = {
    'Main Tweet':5174599,
    'Quote Tweet':1127128
}

// Set accordingly 1357802861128736770
const blacklist_ID= ['1357802861128736770']

async function getAllRules() {

    const response = await needle('get', rulesURL, {
        headers: {
            "authorization": `Bearer ${bearerToken}`
        }
    })

    if (response.statusCode !== 200) {
        console.log("Error:", response.statusMessage, response.statusCode)
        throw new Error(response.body);
    }

    return (response.body);
}

async function deleteAllRules(rules) {

    if (!Array.isArray(rules.data)) {
        return null;
    }

    const ids = rules.data.map(rule => rule.id);

    const data = {
        "delete": {
            "ids": ids
        }
    }

    const response = await needle('post', rulesURL, data, {
        headers: {
            "content-type": "application/json",
            "authorization": `Bearer ${bearerToken}`
        }
    })

    if (response.statusCode !== 200) {
        throw new Error(response.body);
    }

    return (response.body);

}

async function setRules() {

    const data = {
        "add": rules
    }

    const response = await needle('post', rulesURL, data, {
        headers: {
            "content-type": "application/json",
            "authorization": `Bearer ${bearerToken}`
        }
    })

    if (response.statusCode !== 201) {
        throw new Error(response.body);
    }

    return (response.body);

}

function streamConnect(retryAttempt) {

    const stream = needle.get(streamURL, {
        headers: {
            "User-Agent": "v2FilterStreamJS",
            "Authorization": `Bearer ${bearerToken}`
        },
        timeout: 20000
    });

    stream.on('data', data => {
        try {
            const json = JSON.parse(data);
            if( !blacklist_ID.includes(json.data.author_id) ){

                let parsedText = json.data.text.replace(/(?:https?|ftp):\/\/[\n\S]+/g, '');

                client.tweets.findTweetById(json.data.id, {
                    "expansions": [
                        "attachments.media_keys",
                        "author_id"
                    ],
                    "media.fields": [
                        "preview_image_url",
                        "type",
                        "url"
                    ],
                    "user.fields": [
                        "profile_image_url",
                        "public_metrics",
                        "username"
                    ]
                }).then( response =>{
                    if(parseInt(response.includes.users[0].public_metrics.followers_count) >= process.env.MIN_FOLLOWER_COUNT){

                        let title = json.matching_rules[0].tag;
                        let color = tweetColor[json.matching_rules[0].tag];
                        let profileImageURL = response.includes.users[0].profile_image_url;
                        let username = `@`+response.includes.users[0].username;
                        let followersCount = response.includes.users[0].public_metrics.followers_count;
                        let tweetURL = `https://twitter.com/`+response.includes.users[0].username+`/status/`+json.data.id;

                        let attachmentImageURL ='';
                        if(response.includes !== undefined && response.includes.media !== undefined){
                            if(response.includes.media[0].type == 'video'){
                                attachmentImageURL= response.includes.media[0].preview_image_url
                            }else if(response.includes.media[0].type == 'photo'){
                                attachmentImageURL = response.includes.media[0].url
                            }
                        }

                        let embeds = [
                            {
                                title: title,
                                color: color,
                                description:parsedText,
                                thumbnail: {
                                    "url": profileImageURL
                                },
                                image: {
                                    "url":attachmentImageURL
                                },
                                fields: [
                                    {
                                        name: "Username",
                                        value:username,
                                        inline: true
                                    },
                                    {
                                        name: "Followers",
                                        value:followersCount,
                                        inline: true
                                    },
                                    {
                                        name: "Link  :link:",
                                        value: tweetURL
                                    }
                                ],
                            },
                        ];
                        var config = {
                            method: "POST",
                            url: webhookURL,
                            headers: { "Content-Type": "application/json" },
                            data: JSON.stringify({ embeds }),
                        };   
                        axios(config)
                            .then((res) => {
                                console.log("Webhook delivered successfully - "+username);
                                return res;
                            }).catch((error) => {
                                console.log(error);
                                return error;
                            });
                    }
                }).catch(err =>{
                    console.log("Error in Twitter API");
                    process.exit(1);
                })
            }
            retryAttempt = 0;
        } catch (e) {
            if (data.detail === "This stream is currently at the maximum allowed connection limit.") {
                console.log(data.detail)
                process.exit(1)
            } else {
            }
        }
    }).on('err', error => {
        if (error.code !== 'ECONNRESET') {
            console.log(error.code);
            process.exit(1);
        } else {
            setTimeout(() => {
                console.warn("A connection error occurred. Reconnecting...")
                streamConnect(++retryAttempt);
            }, 2 ** retryAttempt)
        }
    });

    return stream;

}


(async () => {
    let currentRules;

    try {
        currentRules = await getAllRules();

        await deleteAllRules(currentRules);

        await setRules();

    } catch (e) {
        console.error(e);
        process.exit(1);
    }

    streamConnect(0);
})();