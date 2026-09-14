const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    EmbedBuilder,
    ChannelType,
    PermissionFlagsBits,
    MessageFlags
} = require('discord.js');

// ==================================================
// 設定
// ==================================================

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = '1548652857455026257';
const GUILD_ID = '1548654022687465514';

const RECRUIT_CATEGORY_NAME = '募集';

// ==================================================
// ランク設定（※実際のロールIDに変更してください）
// ==================================================

const RANKS = [
    { name: 'アイアン', id: '1398661332089176169' },
    { name: 'ブロンズ', id: '1398661728270553209' },
    { name: 'シルバー', id: '1398661909699362953' },
    { name: 'ゴールド', id: '1398661954285080616' },
    { name: 'プラチナ', id: '1398661992159383724' },
    { name: 'ダイヤモンド', id: '1398662041669075045' },
    { name: 'アセンダント', id: '1398662081133412513' },
    { name: 'イモータル', id: '1398662160434987131' },
    { name: 'レディアント', id: '1398662195096715275' }
];

// ==================================================
// パーティ設定
// ==================================================

const PARTY_SETTINGS = {

    DUO: {
        name: 'DUO',
        maxMembers: 2,
        emoji: '🟦'
    },

    TRIO: {
        name: 'TRIO',
        maxMembers: 3,
        emoji: '🟩'
    },

    FULL: {
        name: 'FULL PARTY',
        maxMembers: 5,
        emoji: '🟥'
    }

};

// ==================================================
// 募集中データ
// ==================================================

const recruitments = new Map();

// VCが空になったときの削除タイマー
const emptyTimers = new Map();

// ==================================================
// Discord Client
// ==================================================

const client = new Client({

    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates
    ]

});

// ==================================================
// /募集 コマンド
// ==================================================

const commands = [

    new SlashCommandBuilder()
        .setName('募集')
        .setDescription(
            'VALORANTのパーティ募集を作成します'
        )

].map(command => command.toJSON());

const rest = new REST({
    version: '10'
}).setToken(TOKEN);

// ==================================================
// Bot起動
// ==================================================

client.once('ready', async () => {

    console.log(
        'Party Maker がオンラインになりました！'
    );

    try {

        await rest.put(

            Routes.applicationGuildCommands(
                CLIENT_ID,
                GUILD_ID
            ),

            {
                body: commands
            }

        );

        console.log(
            '/募集 コマンドを登録しました！'
        );

    } catch (error) {

        console.error(
            'コマンド登録エラー:',
            error
        );

    }

});

// ==================================================
// ランク取得
// ==================================================

function getUserRank(member) {

    for (
        let i = 0;
        i < RANKS.length;
        i++
    ) {

        const rankName = RANKS[i].name;

        const hasRank = member.roles.cache.some(
            role => role.name === rankName || role.id === RANKS[i].id
        );

        if (hasRank) {

            return {

                index: i,
                name: rankName,
                id: RANKS[i].id

            };

        }

    }

    return null;

}

// ==================================================
// ランク表示
// ==================================================

function getRankDisplay(member) {

    const rank = getUserRank(member);

    if (!rank) {

        return '🏆 ランク未設定';

    }

    return `🏆 ${rank.name}`;

}

// ==================================================
// DUO / TRIO のランク範囲
// ==================================================

function getNearbyRankRange(rankIndex) {

    const minRankIndex =
        Math.max(
            0,
            rankIndex - 1
        );

    const maxRankIndex =
        Math.min(
            RANKS.length - 1,
            rankIndex + 1
        );

    return {

        minRankIndex,
        maxRankIndex,

        minRank:
            RANKS[minRankIndex].name,

        maxRank:
            RANKS[maxRankIndex].name

    };

}

// ==================================================
// 募集パーティー全体のランク差チェック
// ==================================================

function checkPartyRankSpread(
    rankIndexes
) {

    if (!rankIndexes || rankIndexes.length === 0) {

        return {

            valid: true,
            lowestIndex: null,
            highestIndex: null

        };

    }

    const lowestIndex =
        Math.min(...rankIndexes);

    const highestIndex =
        Math.max(...rankIndexes);

    const difference =
        highestIndex - lowestIndex;

    return {

        valid: difference <= 1,

        lowestIndex,
        highestIndex,
        difference,

        lowestRank:
            RANKS[lowestIndex].name,

        highestRank:
            RANKS[highestIndex].name

    };

}

// ==================================================
// 現在の参加者のランクを取得
// ==================================================

async function getRecruitmentRankIndexes(
    recruitment
) {

    const rankIndexes = [];

    for (
        const userId of recruitment.members
    ) {

        const member =
            await recruitment.guild.members
                .fetch(userId)
                .catch(() => null);

        if (!member) {

            continue;

        }

        const rank =
            getUserRank(member);

        if (!rank) {

            continue;

        }

        rankIndexes.push(
            rank.index
        );

    }

    return rankIndexes;

}

// ==================================================
// 「募集」カテゴリ取得
// ==================================================

async function getRecruitCategory(guild) {

    let category =
        guild.channels.cache.find(
            channel =>
                channel.type ===
                    ChannelType.GuildCategory &&
                channel.name ===
                    RECRUIT_CATEGORY_NAME
        );

    if (category) {

        return category;

    }

    category =
        await guild.channels.create({

            name:
                RECRUIT_CATEGORY_NAME,

            type:
                ChannelType.GuildCategory

        });

    console.log(
        '「募集」カテゴリを作成しました！'
    );

    return category;

}

// ==================================================
// VC参加権限を追加
// ==================================================

async function addMemberToVoice(
    voiceChannel,
    member
) {

    try {

        await voiceChannel.permissionOverwrites.edit(

            member.id,

            {

                ViewChannel: true,
                Connect: true,
                Speak: true

            }

        );

        console.log(
            `${member.user.tag} にVCアクセス権を追加しました`
        );

        return true;

    } catch (error) {

        console.error(
            'VCアクセス権追加エラー:',
            error
        );

        return false;

    }

}

// ==================================================
// 参加者一覧作成
// ==================================================

async function getParticipantDisplay(
    recruitment
) {

    const lines = [];

    for (
        const userId of recruitment.members
    ) {

        const member =
            await recruitment.guild.members
                .fetch(userId)
                .catch(() => null);

        if (!member) {

            lines.push(
                `<@${userId}> 🏆 ランク未設定`
            );

            continue;

        }

        const rank =
            getUserRank(member);

        if (rank) {

            lines.push(
                `<@${userId}> 🏆 ${rank.name}`
            );

        } else {

            lines.push(
                `<@${userId}> 🏆 ランク未設定`
            );

        }

    }

    return lines.join('\n');

}

// ==================================================
// 募集パネル更新
// ==================================================

async function updateRecruitmentPanel(
    recruitment
) {

    const textChannel =
        await recruitment.guild.channels
            .fetch(
                recruitment.textChannelId
            )
            .catch(() => null);

    if (!textChannel) return;

    const message =
        await textChannel.messages
            .fetch(
                recruitment.messageId
            )
            .catch(() => null);

    if (!message) return;

    const count =
        recruitment.members.length;

    const full =
        count >= recruitment.maxMembers;

    const memberList =
        await getParticipantDisplay(
            recruitment
        );

    const embed =
        new EmbedBuilder()
            .setTitle(
                `${recruitment.emoji} ${recruitment.partyName}募集`
            )
            .setDescription(

                `${full
                    ? '🔒 **募集終了**'
                    : '🟢 **募集中**'}\n\n` +

                `🏆 **ランク：${recruitment.minRank} ～ ${recruitment.maxRank}**\n\n` +

                `👥 **人数：${count} / ${recruitment.maxMembers}**\n\n` +

                `👤 **参加者**\n` +

                `${memberList || 'まだ参加者はいません'}\n\n` +

                `🔊 **VC：<#${recruitment.voiceChannelId}>**`

            );

    const joinButton =
        new ButtonBuilder()
            .setCustomId(
                `join_${recruitment.id}`
            )
            .setLabel(
                full
                    ? '募集終了'
                    : '参加する'
            )
            .setEmoji(
                full
                    ? '🔒'
                    : '➕'
            )
            .setStyle(
                full
                    ? ButtonStyle.Secondary
                    : ButtonStyle.Success
            )
            .setDisabled(full);

    const cancelButton =
        new ButtonBuilder()
            .setCustomId(
                `cancel_${recruitment.id}`
            )
            .setLabel(
                full
                    ? '募集を削除'
                    : '募集を終了'
            )
            .setEmoji(
                full
                    ? '🗑️'
                    : '❌'
            )
            .setStyle(
                ButtonStyle.Danger
            );

    const row =
        new ActionRowBuilder()
            .addComponents(
                joinButton,
                cancelButton
            );

    await message.edit({

        embeds: [
            embed
        ],

        components: [
            row
        ]

    }).catch(() => {});

    if (full) {

        recruitment.closed = true;

    }

}

// ==================================================
// 募集削除
// ==================================================

async function deleteRecruitment(
    recruitmentId,
    reason = 'Party Maker 募集終了'
) {

    const recruitment =
        recruitments.get(
            recruitmentId
        );

    if (!recruitment) return;

    if (
        emptyTimers.has(
            recruitmentId
        )
    ) {

        clearTimeout(
            emptyTimers.get(
                recruitmentId
            )
        );

        emptyTimers.delete(
            recruitmentId
        );

    }

    const voiceChannel =
        await recruitment.guild.channels
            .fetch(
                recruitment.voiceChannelId
            )
            .catch(() => null);

    if (voiceChannel) {

        await voiceChannel
            .delete(reason)
            .catch(error => {

                console.error(
                    'VC削除エラー:',
                    error
                );

            });

    }

    const textChannel =
        await recruitment.guild.channels
            .fetch(
                recruitment.textChannelId
            )
            .catch(() => null);

    if (textChannel) {

        const message =
            await textChannel.messages
                .fetch(
                    recruitment.messageId
                )
                .catch(() => null);

        if (message) {

            await message
                .delete()
                .catch(() => {});

        }

    }

    recruitments.delete(
        recruitmentId
    );

    console.log(
        `Party Maker: 募集 ${recruitmentId} を削除しました`
    );

}

// ==================================================
// VCが空になったときのタイマー
// ==================================================

function startEmptyTimer(
    recruitment
) {

    const recruitmentId =
        recruitment.id;

    if (
        emptyTimers.has(
            recruitmentId
        )
    ) {

        return;

    }

    console.log(
        `${recruitment.partyName} のVCが空になりました。1分後に削除します。`
    );

    const timer =
        setTimeout(
            async () => {

                emptyTimers.delete(
                    recruitmentId
                );

                const voiceChannel =
                    await recruitment.guild.channels
                        .fetch(
                            recruitment.voiceChannelId
                        )
                        .catch(() => null);

                if (!voiceChannel) {

                    recruitments.delete(
                        recruitmentId
                    );

                    return;

                }

                if (
                    voiceChannel.members.size === 0
                ) {

                    console.log(
                        `${voiceChannel.name} を削除します`
                    );

                    await deleteRecruitment(

                        recruitmentId,

                        'VCが1分間空だったため削除'

                    );

                } else {

                    console.log(
                        `${voiceChannel.name} に人がいるため削除しません`
                    );

                }

            },

            60 * 1000

        );

    emptyTimers.set(
        recruitmentId,
        timer
    );

}

// ==================================================
// Interaction
// ==================================================

client.on(
    'interactionCreate',
    async interaction => {

        try {

            if (
                interaction.isChatInputCommand()
            ) {

                if (
                    interaction.commandName !==
                    '募集'
                ) {

                    return;

                }

                const embed =
                    new EmbedBuilder()
                        .setTitle(
                            '🎮 VALORANT パーティ募集'
                        )
                        .setDescription(

                            '募集するパーティ人数を選択してください。\n\n' +

                            '🟦 **DUO** → 2人\n' +

                            '🟩 **TRIO** → 3人\n' +

                            '🟥 **FULL PARTY** → 5人'

                        );

                const row =
                    new ActionRowBuilder()
                        .addComponents(

                            new ButtonBuilder()
                                .setCustomId(
                                    'party_DUO'
                                )
                                .setLabel(
                                    'DUO'
                                )
                                .setEmoji(
                                    '🟦'
                                )
                                .setStyle(
                                    ButtonStyle.Primary
                                ),

                            new ButtonBuilder()
                                .setCustomId(
                                    'party_TRIO'
                                )
                                .setLabel(
                                    'TRIO'
                                )
                                .setEmoji(
                                    '🟩'
                                )
                                .setStyle(
                                    ButtonStyle.Success
                                ),

                            new ButtonBuilder()
                                .setCustomId(
                                    'party_FULL'
                                )
                                .setLabel(
                                    'FULL PARTY'
                                )
                                .setEmoji(
                                    '🟥'
                                )
                                .setStyle(
                                    ButtonStyle.Danger
                                )

                        );

                await interaction.reply({

                    embeds: [
                        embed
                    ],

                    components: [
                        row
                    ],

                    flags:
                        MessageFlags.Ephemeral

                });

                return;

            }

            if (
                interaction.isButton() &&
                interaction.customId.startsWith(
                    'party_'
                )
            ) {

                const partyType =
                    interaction.customId
                        .replace(
                            'party_',
                            ''
                        );

                const settings =
                    PARTY_SETTINGS[
                        partyType
                    ];

                if (!settings) return;

                if (
                    partyType === 'DUO' ||
                    partyType === 'TRIO'
                ) {

                    const member =
                        await interaction.guild.members
                            .fetch(
                                interaction.user.id
                            )
                            .catch(() => null);

                    if (!member) {

                        await interaction.reply({

                            content:
                                '❌ メンバー情報を取得できませんでした。',

                            flags:
                                MessageFlags.Ephemeral

                        });

                        return;

                    }

                    const userRank =
                        getUserRank(member);

                    if (!userRank) {

                        await interaction.reply({

                            content:
                                '❌ あなたのランクロールが見つかりません。\n\n' +
                                'サーバーの「体験をカスタマイズしましょう」でランクを設定してください。',

                            flags:
                                MessageFlags.Ephemeral

                        });

                        return;

                    }

                    const range =
                        getNearbyRankRange(
                            userRank.index
                        );

                    await createRecruitment(

                        interaction,

                        partyType,

                        range.minRankIndex,

                        range.maxRankIndex

                    );

                    return;

                }

                const minRankMenu =
                    new StringSelectMenuBuilder()
                        .setCustomId(
                            'minrank_FULL'
                        )
                        .setPlaceholder(
                            '最低ランクを選択'
                        );

                RANKS.forEach(
                    (rankObj, index) => {

                        minRankMenu.addOptions({

                            label:
                                rankObj.name,

                            value:
                                String(index),

                            emoji:
                                '🏆'

                        });

                    }
                );

                const row =
                    new ActionRowBuilder()
                        .addComponents(
                            minRankMenu
                        );

                await interaction.update({

                    content:
                        '🟥 **FULL PARTY**\n\n' +
                        '募集する最低ランクを選択してください.',

                    components: [
                        row
                    ]

                });

                return;

            }

            if (
                interaction.isStringSelectMenu()
            ) {

                if (
                    interaction.customId.startsWith(
                        'minrank_'
                    )
                ) {

                    const minRankIndex =
                        Number(
                            interaction.values[0]
                        );

                    const minRank =
                        RANKS[
                            minRankIndex
                        ].name;

                    const maxRankMenu =
                        new StringSelectMenuBuilder()
                            .setCustomId(
                                `maxrank_FULL_${minRankIndex}`
                            )
                            .setPlaceholder(
                                '最高ランクを選択'
                            );

                    for (
                        let i =
                            minRankIndex;

                        i <
                        RANKS.length;

                        i++
                    ) {

                        maxRankMenu.addOptions({

                            label:
                                RANKS[i].name,

                            value:
                                String(i),

                            emoji:
                                '🏆'

                        });

                    }

                    const row =
                        new ActionRowBuilder()
                            .addComponents(
                                maxRankMenu
                            );

                    await interaction.update({

                        content:

                            `🟥 **FULL PARTY**\n\n` +

                            `最低ランク：**${minRank}**\n\n` +

                            '最高ランクを選択してください。',

                        components: [
                            row
                        ]

                    });

                    return;

                }

                if (
                    interaction.customId.startsWith(
                        'maxrank_'
                    )
                ) {

                    const parts =
                        interaction.customId.split(
                            '_'
                        );

                    const partyType =
                        parts[1];

                    const minRankIndex =
                        Number(
                            parts[2]
                        );

                    const maxRankIndex =
                        Number(
                            interaction.values[0]
                        );

                    await createRecruitment(

                        interaction,

                        partyType,

                        minRankIndex,

                        maxRankIndex

                    );

                    return;

                }

            }

            if (
                interaction.isButton() &&
                interaction.customId.startsWith(
                    'join_'
                )
            ) {

                const recruitmentId =
                    interaction.customId
                        .replace(
                            'join_',
                            ''
                        );

                const recruitment =
                    recruitments.get(
                        recruitmentId
                    );

                if (!recruitment) {

                    await interaction.reply({

                        content:
                            '❌ この募集は存在しないか、すでに終了しています。',

                        flags:
                            MessageFlags.Ephemeral

                    });

                    return;

                }

                if (recruitment.closed) {

                    await interaction.reply({

                        content:
                            '🔒 この募集はすでに終了しています。',

                        flags:
                            MessageFlags.Ephemeral

                    });

                    return;

                }

                if (
                    recruitment.members.length >=
                    recruitment.maxMembers
                ) {

                    await interaction.reply({

                        content:
                            '🔒 この募集は満員です。',

                        flags:
                            MessageFlags.Ephemeral

                    });

                    return;

                }

                if (
                    recruitment.members.includes(
                        interaction.user.id
                    )
                ) {

                    await interaction.reply({

                        content:
                            '⚠️ あなたはすでに参加しています。',

                        flags:
                            MessageFlags.Ephemeral

                    });

                    return;

                }

                const member =
                    await interaction.guild.members
                        .fetch(
                            interaction.user.id
                        )
                        .catch(() => null);

                if (!member) {

                    await interaction.reply({

                        content:
                            '❌ メンバー情報を取得できませんでした。',

                        flags:
                            MessageFlags.Ephemeral

                    });

                    return;

                }

                const userRank =
                    getUserRank(member);

                if (!userRank) {

                    await interaction.reply({

                        content:
                            '❌ あなたのランクロールが見つかりません。\n\n' +
                            '「体験をカスタマイズしましょう」でランクを設定してください。',

                        flags:
                            MessageFlags.Ephemeral

                    });

                    return;

                }

                if (
                    userRank.index <
                        recruitment.minRankIndex ||

                    userRank.index >
                        recruitment.maxRankIndex
                ) {

                    await interaction.reply({

                        content:

                            `❌ この募集には参加できません。\n\n` +

                            `🏆 募集ランク：**${recruitment.minRank} ～ ${recruitment.maxRank}**\n` +

                            `🏆 あなたのランク：**${userRank.name}**`,

                        flags:
                            MessageFlags.Ephemeral

                    });

                    return;

                }

                const currentRankIndexes =
                    await getRecruitmentRankIndexes(
                        recruitment
                    );

                currentRankIndexes.push(
                    userRank.index
                );

                const spread =
                    checkPartyRankSpread(
                        currentRankIndexes
                    );

                if (!spread.valid) {

                    await interaction.reply({

                        content:

                            `❌ このパーティーには参加できません。\n\n` +

                            `🏆 現在のランク範囲：**${spread.lowestRank} ～ ${spread.highestRank}**\n` +

                            `🏆 あなたのランク：**${userRank.name}**\n\n` +

                            `⚠️ パーティー内のランク差が大きすぎます。\n` +

                            `最低ランクと最高ランクの差は1ランク以内である必要があります。`,

                        flags:
                            MessageFlags.Ephemeral

                    });

                    return;

                }

                const voiceChannel =
                    await interaction.guild.channels
                        .fetch(
                            recruitment.voiceChannelId
                        )
                        .catch(() => null);

                if (!voiceChannel) {

                    await interaction.reply({

                        content:
                            '❌ 専用VCが見つかりません。',

                        flags:
                            MessageFlags.Ephemeral

                    });

                    return;

                }

                const permissionAdded =
                    await addMemberToVoice(

                        voiceChannel,

                        member

                    );

                if (!permissionAdded) {

                    await interaction.reply({

                        content:
                            '❌ VCのアクセス権を追加できませんでした。\nBotに「チャンネルの管理」権限があるか確認してください。',

                        flags:
                            MessageFlags.Ephemeral

                    });

                    return;

                }

                recruitment.members.push(
                    interaction.user.id
                );

                await interaction.reply({

                    content:

                        `✅ **${recruitment.partyName}** に参加しました！\n\n` +

                        `👤 ユーザー：<@${interaction.user.id}>\n` +

                        `🏆 ランク：**${userRank.name}**\n\n` +

                        `🔊 VC：<#${voiceChannel.id}>\n\n` +

                        `VCへのアクセス権を付与しました。\n` +

                        `👉 自動でVCへ移動しないので、自分でVCに入ってください。`,

                    flags:
                        MessageFlags.Ephemeral

                });

                await updateRecruitmentPanel(
                    recruitment
                );

                return;

            }

            if (
                interaction.isButton() &&
                interaction.customId.startsWith(
                    'cancel_'
                )
            ) {

                const recruitmentId =
                    interaction.customId
                        .replace(
                            'cancel_',
                            ''
                        );

                const recruitment =
                    recruitments.get(
                        recruitmentId
                    );

                if (!recruitment) {

                    await interaction.reply({

                        content:
                            '❌ この募集はすでに終了しています。',

                        flags:
                            MessageFlags.Ephemeral

                    });

                    return;

                }

                if (
                    interaction.user.id !==
                    recruitment.creatorId
                ) {

                    await interaction.reply({

                        content:
                            '❌ 募集主だけが募集を終了できます。',

                        flags:
                            MessageFlags.Ephemeral

                    });

                    return;

                }

                await deleteRecruitment(

                    recruitmentId,

                    '募集主が募集を終了'

                );

                await interaction.reply({

                    content:
                        '✅ 募集を終了しました。',

                    flags:
                        MessageFlags.Ephemeral

                });

                return;

            }

        } catch (error) {

            console.error(
                'Interactionエラー:',
                error
            );

            if (
                !interaction.replied &&
                !interaction.deferred
            ) {

                await interaction.reply({

                    content:
                        '❌ エラーが発生しました。Botのコンソールを確認してください。',

                    flags:
                        MessageFlags.Ephemeral

                }).catch(() => {});

            }

        }

    }
);

// ==================================================
// 募集作成
// ==================================================

async function createRecruitment(

    interaction,

    partyType,

    minRankIndex,

    maxRankIndex

) {

    const settings =
        PARTY_SETTINGS[
            partyType
        ];

    if (!settings) return;

    const guild =
        interaction.guild;

    if (
        minRankIndex < 0 ||
        maxRankIndex >= RANKS.length ||
        minRankIndex > maxRankIndex
    ) {

        await interaction.reply({

            content:
                '❌ ランク設定が正しくありません。',

            flags:
                MessageFlags.Ephemeral

        });

        return;

    }

    const minRank =
        RANKS[minRankIndex].name;

    const maxRank =
        RANKS[maxRankIndex].name;

    const creator =
        await guild.members
            .fetch(
                interaction.user.id
            )
            .catch(() => null);

    if (!creator) {

        await interaction.reply({

            content:
                '❌ メンバー情報を取得できませんでした。',

            flags:
                MessageFlags.Ephemeral

        });

        return;

    }

    const creatorRank =
        getUserRank(creator);

    if (!creatorRank) {

        await interaction.reply({

            content:
                '❌ あなたのランクロールが見つかりません。\n\n' +
                '運営に問い合わせてください。',

            flags:
                MessageFlags.Ephemeral

        });

        return;

    }

    if (
        creatorRank.index <
            minRankIndex ||

        creatorRank.index >
            maxRankIndex
    ) {

        await interaction.reply({

            content:

                `❌ 募集範囲を作成できません。\n\n` +

                `あなたのランク：**${creatorRank.name}**\n` +

                `募集範囲：**${minRank} ～ ${maxRank}**`,

            flags:
                MessageFlags.Ephemeral

        });

        return;

    }

    const category =
        await getRecruitCategory(
            guild
        );

    const recruitmentId =
        `${interaction.user.id}_${Date.now()}`;

    const voiceChannel =
        await guild.channels.create({

            name:
                `${settings.emoji} ${minRank}-${maxRank}｜${settings.name}`,

            type:
                ChannelType.GuildVoice,

            parent:
                category.id,

            permissionOverwrites: [

                {

                    id:
                        guild.roles.everyone.id,

                    deny: [

                        PermissionFlagsBits.ViewChannel,

                        PermissionFlagsBits.Connect

                    ]

                },

                {

                    id:
                        creator.id,

                    allow: [

                        PermissionFlagsBits.ViewChannel,

                        PermissionFlagsBits.Connect,

                        PermissionFlagsBits.Speak

                    ]

                }

            ]

        });

    const recruitment = {

        id:
            recruitmentId,

        guild:
            guild,

        textChannelId:
            interaction.channel.id,

        messageId:
            null,

        voiceChannelId:
            voiceChannel.id,

        creatorId:
            creator.id,

        partyType:
            partyType,

        partyName:
            settings.name,

        maxMembers:
            settings.maxMembers,

        minRankIndex:
            minRankIndex,

        maxRankIndex:
            maxRankIndex,

        minRank:
            minRank,

        maxRank:
            maxRank,

        emoji:
            settings.emoji,

        members: [

            creator.id

        ],

        closed:
            false

    };

    recruitments.set(

        recruitmentId,

        recruitment

    );

    const memberList =
        `<@${creator.id}> 🏆 ${creatorRank.name}`;

    const embed =
        new EmbedBuilder()
            .setTitle(
                `${settings.emoji} ${settings.name}募集`
            )
            .setDescription(

                `🟢 **募集中**\n\n` +

                `🏆 **ランク：${minRank} ～ ${maxRank}**\n\n` +

                `👥 **人数：1 / ${settings.maxMembers}**\n\n` +

                `👤 **参加者**\n` +

                `${memberList}\n\n` +

                `🔊 **VC：<#${voiceChannel.id}>**`

            );

    const joinButton =
        new ButtonBuilder()
            .setCustomId(
                `join_${recruitmentId}`
            )
            .setLabel(
                '参加する'
            )
            .setEmoji(
                '➕'
            )
            .setStyle(
                ButtonStyle.Success
            );

    const cancelButton =
        new ButtonBuilder()
            .setCustomId(
                `cancel_${recruitmentId}`
            )
            .setLabel(
                '募集を終了'
            )
            .setEmoji(
                '❌'
            )
            .setStyle(
                ButtonStyle.Danger
            );

    const row =
        new ActionRowBuilder()
            .addComponents(

                joinButton,

                cancelButton

            );

    if (
        interaction.replied ||
        interaction.deferred
    ) {

        await interaction.editReply({

            content:
                `🎮 **${settings.name}を作成しました！**`,

            components: []

        }).catch(() => {});

    } else {

        await interaction.reply({

            content:
                `🎮 **${settings.name}を作成しました！**`,

            components: [],

            flags:
                MessageFlags.Ephemeral

        });

    }

    // ==================================================
    // メンション用ロールIDの文字列を組み立て
    // ==================================================

    const targetMentions = [];
    for (let i = minRankIndex; i <= maxRankIndex; i++) {
        if (RANKS[i].id && !RANKS[i].id.startsWith('YOUR_')) {
            targetMentions.push(`<@&${RANKS[i].id}>`);
        }
    }
    const mentionText = targetMentions.length > 0 ? targetMentions.join(' ') : '';

    // ==================================================
    // 募集パネル送信 (メンション付き)
    // ==================================================

    const message =
        await interaction.channel.send({

            content: mentionText || null,

            embeds: [
                embed
            ],

            components: [
                row
            ]

        });

    recruitment.messageId =
        message.id;

    startEmptyTimer(
        recruitment
    );

    await interaction.followUp({

        content:

            `⚠️ **募集主への注意**\n\n` +

            `1分以内に入らなかった場合自動的にVCチャンネルが削除されます。\n\n` +

            `📁 カテゴリ：**募集**\n` +

            `🏆 ランク：**${minRank} ～ ${maxRank}**\n` +

            `👥 **${settings.name}：${settings.maxMembers}人**\n\n` +

            `🔊 VC：<#${voiceChannel.id}>\n\n` +

            `⚠️ VCへは自動移動しません。自分でVCに入ってください。`,

        flags:
            MessageFlags.Ephemeral

    }).catch(() => {});

}

// ==================================================
// VC状態監視
// ==================================================

client.on(
    'voiceStateUpdate',
    async (
        oldState,
        newState
    ) => {

        try {

            for (
                const [
                    recruitmentId,
                    recruitment
                ]
                of recruitments
            ) {

                const isOldChannel =
                    oldState.channelId ===
                    recruitment.voiceChannelId;

                const isNewChannel =
                    newState.channelId ===
                    recruitment.voiceChannelId;

                if (
                    !isOldChannel &&
                    !isNewChannel
                ) {

                    continue;

                }

                const voiceChannel =
                    await recruitment.guild.channels
                        .fetch(
                            recruitment.voiceChannelId
                        )
                        .catch(() => null);

                if (!voiceChannel) {

                    recruitments.delete(
                        recruitmentId
                    );

                    if (
                        emptyTimers.has(
                            recruitmentId
                        )
                    ) {

                        clearTimeout(
                            emptyTimers.get(
                                recruitmentId
                            )
                        );

                        emptyTimers.delete(
                            recruitmentId
                        );

                    }

                    continue;

                }

                if (isNewChannel) {

                    if (
                        emptyTimers.has(
                            recruitmentId
                        )
                    ) {

                        clearTimeout(
                            emptyTimers.get(
                                recruitmentId
                            )
                        );

                        emptyTimers.delete(
                            recruitmentId
                        );

                        console.log(
                            `${voiceChannel.name}: VCに人が入ったため1分タイマーをキャンセル`
                        );

                    }

                    if (
                        !recruitment.members.includes(
                            newState.id
                        )
                    ) {

                        recruitment.members.push(
                            newState.id
                        );

                    }

                    await updateRecruitmentPanel(
                        recruitment
                    );

                }

                if (
                    isOldChannel &&
                    oldState.channelId !==
                        newState.channelId
                ) {

                    recruitment.members =
                        recruitment.members.filter(
                            id =>
                                id !== oldState.id
                        );

                    if (
                        voiceChannel.members.size === 0
                    ) {

                        startEmptyTimer(
                            recruitment
                        );

                    }

                    await updateRecruitmentPanel(
                        recruitment
                    );

                }

            }

        } catch (error) {

            console.error(
                'voiceStateUpdateエラー:',
                error
            );

        }

    }
);

// ==================================================
// Botログイン
// ==================================================

client.login(
    TOKEN
);
