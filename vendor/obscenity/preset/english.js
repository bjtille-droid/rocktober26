import { DataSet } from '../dataset/DataSet.js';
import { pattern } from '../pattern/Pattern.js';
import { collapseDuplicatesTransformer } from '../transformer/collapse-duplicates/index.js';
import { resolveConfusablesTransformer } from '../transformer/resolve-confusables/index.js';
import { resolveLeetSpeakTransformer } from '../transformer/resolve-leetspeak/index.js';
import { toAsciiLowerCaseTransformer } from '../transformer/to-ascii-lowercase/index.js';
export const englishRecommendedBlacklistMatcherTransformers = [
    resolveConfusablesTransformer(),
    resolveLeetSpeakTransformer(),
    toAsciiLowerCaseTransformer(),
    collapseDuplicatesTransformer({
        defaultThreshold: 1,
        customThresholds: new Map([
            [
                'b',
                2
            ],
            [
                'e',
                2
            ],
            [
                'o',
                2
            ],
            [
                'l',
                2
            ],
            [
                's',
                2
            ],
            [
                'g',
                2
            ]
        ])
    })
];
export const englishRecommendedWhitelistMatcherTransformers = [
    toAsciiLowerCaseTransformer(),
    collapseDuplicatesTransformer({
        defaultThreshold: Number.POSITIVE_INFINITY,
        customThresholds: new Map([
            [
                ' ',
                1
            ]
        ])
    })
];
export const englishRecommendedTransformers = {
    blacklistMatcherTransformers: englishRecommendedBlacklistMatcherTransformers,
    whitelistMatcherTransformers: englishRecommendedWhitelistMatcherTransformers
};
export const englishDataset = new DataSet().addPhrase((phrase)=>phrase.setMetadata({
        originalWord: 'abo'
    }).addPattern(pattern`|ab[b]o[s]|`)).addPhrase((phrase)=>phrase.setMetadata({
        originalWord: 'abeed'
    }).addPattern(pattern`ab[b]eed`)).addPhrase((phrase)=>phrase.setMetadata({
        originalWord: 'africoon'
    }).addPattern(pattern`africoon`)).addPhrase((phrase)=>phrase.setMetadata({
        originalWord: 'anal'
    }).addPattern(pattern`|anal`).addWhitelistedTerm('analabos').addWhitelistedTerm('analagous').addWhitelistedTerm('analav').addWhitelistedTerm('analy').addWhitelistedTerm('analog').addWhitelistedTerm('an al').addPattern(pattern`danal`).addPattern(pattern`eanal`).addPattern(pattern`fanal`).addWhitelistedTerm('fan al').addPattern(pattern`ganal`).addWhitelistedTerm('gan al').addPattern(pattern`ianal`).addWhitelistedTerm('ian al').addPattern(pattern`janal`).addWhitelistedTerm('trojan al').addPattern(pattern`kanal`).addPattern(pattern`lanal`).addWhitelistedTerm('lan al').addPattern(pattern`lanal`).addWhitelistedTerm('lan al').addPattern(pattern`oanal|`).addPattern(pattern`panal`).addWhitelistedTerm('pan al').addPattern(pattern`qanal`).addPattern(pattern`ranal`).addPattern(pattern`sanal`).addPattern(pattern`tanal`).addWhitelistedTerm('tan al').addPattern(pattern`uanal`).addWhitelistedTerm('uan al').addPattern(pattern`vanal`).addWhitelistedTerm('van al').addPattern(pattern`wanal`).addPattern(pattern`xanal`).addWhitelistedTerm('texan al').addPattern(pattern`yanal`).addPattern(pattern`zanal`)).addPhrase((phrase)=>phrase.setMetadata({
        originalWord: 'anus'
    }).addPattern(pattern`anus`).addWhitelistedTerm('an us').addWhitelistedTerm('tetanus').addWhitelistedTerm('uranus').addWhitelistedTerm('janus').addWhitelistedTerm('manus')).addPhrase((phrase)=>phrase.setMetadata({
        originalWord: 'arabush'
    }).addPattern(pattern`arab[b]ush`)).addPhrase((phrase)=>phrase.setMetadata({
        originalWord: 'arse'
    }).addPattern(pattern`|ars[s]e`).addWhitelistedTerm('arsen')).addPhrase((phrase)=>phrase.setMetadata({
        originalWord: 'ass'
    }).addPattern(pattern`|ass`).addWhitelistedTerm('45s').addWhitelistedTerm('assa').addWhitelistedTerm('assem').addWhitelistedTerm('assen').addWhitelistedTerm('asser').addWhitelistedTerm('assess').addWhitelistedTerm('asset').addWhitelistedTerm('assev').addWhitelistedTerm('assi').addWhitelistedTerm('assoc').addWhitelistedTerm('assoi').addWhitelistedTerm('assu')).addPhrase((phrase)=>phrase.setMetadata({
        originalWord: 'bastard'
    }).addPattern(pattern`bas[s]tard`)).addPhrase((phrase)=>phrase.setMetadata({
        originalWord: 'bestiality'
    }).addPattern(pattern`be[e][a]s[s]tial`)).addPhrase((phrase)=>phrase.setMetadata({
        originalWord: 'bitch'
    }).addPattern(pattern`bitch`).addPattern(pattern`bich|`)).addPhrase((phrase)=>phrase.setMetadata({
        originalWord: 'blowjob'
    }).addPattern(pattern`b[b]l[l][o]wj[o]b`)).addPhrase((phrase)=>phrase.setMetadata({
        originalWord: 'bollocks'
    }).addPattern(pattern`bol[l]ock`)).addPhrase((phrase)=>phrase.setMetadata({
        originalWord: 'boob'
    }).addPattern(pattern`boob`)).addPhrase((phrase)=>phrase.setMetadata({
        originalWord: 'boonga'
    }).addPattern(pattern`boonga`).addWhitelistedTerm('baboon ga')).addPhrase((phrase)=>phrase.setMetadata({
        originalWord: 'buttplug'
    }).addPattern(pattern`buttplug`)).addPhrase((phrase)=>phrase.setMetadata({
        originalWord: 'chingchong'
    }).addPattern(pattern`chingchong`)).addPhrase((phrase)=>phrase.setMetadata({
        originalWord: 'chink'
    }).addPattern(pattern`chink`).addWhitelistedTerm('chin k')).addPhrase((phrase)=>phrase.setMetadata({
        originalWord: 'cock'
    }).addPattern(pattern`|cock|`).addPattern(pattern`|cocks`).addPattern(pattern`|cockp`).addPattern(pattern`|cocke[e]|`).addWhitelistedTerm('cockney')).addPhrase((phrase)=>phrase.setMetadata({
        originalWord: 'cuck'
    }).addPattern(pattern`cuck`).addWhitelistedTerm('cuckoo')).addPhrase((phrase)=>phrase.setMetadata({
        originalWord: 'cum'
    }).addPattern(pattern`|cum`).addWhitelistedTerm('cumu').addWhitelistedTerm('cumb')).addPhrase((phrase)=>phrase.setMetadata({
        originalWord: 'cunt'
    }).addPattern(pattern`|cunt`).addPattern(pattern`cunt|`)).addPhrase((phrase)=>phrase.setMetadata({
        originalWord: 'deepthroat'
    }).addPattern(pattern`deepthro[o]at`).addPattern(pattern`deepthro[o]t`)).addPhrase((phrase)=>phrase.setMetadata({
        originalWord: 'dick'
    }).addPattern(pattern`|dck|`).addPattern(pattern`dick`).addWhitelistedTerm('benedick').addWhitelistedTerm('dickens').addWhitelistedTerm('dickety').addWhitelistedTerm('dickory')).addPhrase((phrase)=>phrase.setMetadata({
        originalWord: 'dildo'
    }).addPattern(pattern`dildo`)).addPhrase((phrase)=>phrase.setMetadata({
        originalWord: 'doggystyle'
    }).addPattern(pattern`d[o]g[g]ys[s]t[y]l[l]`)).addPhrase((phrase)=>phrase.setMetadata({
        originalWord: 'double penetration'
    }).addPattern(pattern`double penetra`)).addPhrase((phrase)=>phrase.setMetadata({
        originalWord: 'dyke'
    }).addPattern(pattern`dyke`).addWhitelistedTerm('van dyke')).addPhrase((phrase)=>phrase.setMetadata({
        originalWord: 'ejaculate'
    }).addPattern(pattern`e[e]jacul`).addPattern(pattern`e[e]jakul`).addPattern(pattern`e[e]acul[l]ate`)).addPhrase((phrase)=>phrase.setMetadata({
        originalWord: 'fag'
    }).addPattern(pattern`|fag`).addPattern(pattern`fggot`)).addPhrase((phrase)=>phrase.setMetadata({
        originalWord: 'felch'
    }).addPattern(pattern`fe[e]l[l]ch`)).addPhrase((phrase)=>phrase.setMetadata({
        originalWord: 'fellatio'
    }).addPattern(pattern`f[e][e]llat`)).addPhrase((phrase)=>phrase.setMetadata({
        originalWord: 'finger bang'
    }).addPattern(pattern`fingerbang`)).addPhrase((phrase)=>phrase.setMetadata({
        originalWord: 'fisting'
    }).addPattern(pattern`fistin`)).addPhrase((phrase)=>phrase.setMetadata({
        originalWord: 'fuck'
    }).addPattern(pattern`f[?]ck`).addPattern(pattern`|fk`).addPattern(pattern`|fu|`).addPattern(pattern`|fuk`).addWhitelistedTerm('fick').addWhitelistedTerm('kung-fu').addWhitelistedTerm('kung fu')).addPhrase((phrase)=>phrase.setMetadata({
        originalWord: 'gangbang'
    }).addPattern(pattern`g[?]ngbang`)).addPhrase((phrase)=>phrase.setMetadata({
        originalWord: 'handjob'
    }).addPattern(pattern`h[?]ndjob`)).addPhrase((phrase)=>phrase.setMetadata({
        originalWord: 'hentai'
    }).addPattern(pattern`h[e][e]ntai`)).addPhrase((phrase)=>phrase.setMetadata({
        originalWord: 'hooker'
    }).addPattern(pattern`hooker`)).addPhrase((phrase)=>phrase.setMetadata({
        originalWord: 'incest'
    }).addPattern(pattern`incest`)).addPhrase((phrase)=>phrase.setMetadata({
        originalWord: 'jerk off'
    }).addPattern(pattern`jerkoff`)).addPhrase((phrase)=>phrase.setMetadata({
        originalWord: 'jizz'
    }).addPattern(pattern`jizz`)).addPhrase((phrase)=>phrase.setMetadata({
        originalWord: 'kike'
    }).addPattern(pattern`kike`)).addPhrase((phrase)=>phrase.setMetadata({
        originalWord: 'lubejob'
    }).addPattern(pattern`lubejob`)).addPhrase((phrase)=>phrase.setMetadata({
        originalWord: 'masturbate'
    }).addPattern(pattern`m[?]sturbate`).addPattern(pattern`masterbate`)).addPhrase((phrase)=>phrase.setMetadata({
        originalWord: 'negro'
    }).addPattern(pattern`negro`).addWhitelistedTerm('montenegro').addWhitelistedTerm('negron').addWhitelistedTerm('stoneground').addWhitelistedTerm('winegrow')).addPhrase((phrase)=>phrase.setMetadata({
        originalWord: 'nigger'
    }).addPattern(pattern`n[i]gger`).addPattern(pattern`n[i]gga`).addPattern(pattern`|nig|`).addPattern(pattern`|nigs|`).addWhitelistedTerm('snigger')).addPhrase((phrase)=>phrase.setMetadata({
        originalWord: 'orgasm'
    }).addPattern(pattern`[or]gasm`).addWhitelistedTerm('gasma')).addPhrase((phrase)=>phrase.setMetadata({
        originalWord: 'orgy'
    }).addPattern(pattern`orgy`).addPattern(pattern`orgies`).addWhitelistedTerm('porgy')).addPhrase((phrase)=>phrase.setMetadata({
        originalWord: 'penis'
    }).addPattern(pattern`pe[e]nis`).addPattern(pattern`|pnis`).addWhitelistedTerm('pen is')).addPhrase((phrase)=>phrase.setMetadata({
        originalWord: 'piss'
    }).addPattern(pattern`|piss`)).addPhrase((phrase)=>phrase.setMetadata({
        originalWord: 'porn'
    }).addPattern(pattern`|prn|`).addPattern(pattern`porn`).addWhitelistedTerm('p orna')).addPhrase((phrase)=>phrase.setMetadata({
        originalWord: 'prick'
    }).addPattern(pattern`|prick[s]|`)).addPhrase((phrase)=>phrase.setMetadata({
        originalWord: 'pussy'
    }).addPattern(pattern`p[u]ssy`)).addPhrase((phrase)=>phrase.setMetadata({
        originalWord: 'rape'
    }).addPattern(pattern`|rape`).addPattern(pattern`|rapis[s]t`).addWhitelistedTerm('rapper')).addPhrase((phrase)=>phrase.setMetadata({
        originalWord: 'retard'
    }).addPattern(pattern`retard`)).addPhrase((phrase)=>phrase.setMetadata({
        originalWord: 'scat'
    }).addPattern(pattern`|s[s]cat|`)).addPhrase((phrase)=>phrase.setMetadata({
        originalWord: 'semen'
    }).addPattern(pattern`|s[s]e[e]me[e]n`)).addPhrase((phrase)=>phrase.setMetadata({
        originalWord: 'sex'
    }).addPattern(pattern`|s[s]e[e]x|`).addPattern(pattern`|s[s]e[e]xy|`)).addPhrase((phrase)=>phrase.setMetadata({
        originalWord: 'shit'
    }).addPattern(pattern`|shit`).addPattern(pattern`shit|`).addWhitelistedTerm('s hit').addWhitelistedTerm('sh it').addWhitelistedTerm('shi t').addWhitelistedTerm('shitake')).addPhrase((phrase)=>phrase.setMetadata({
        originalWord: 'slut'
    }).addPattern(pattern`s[s]lut`)).addPhrase((phrase)=>phrase.setMetadata({
        originalWord: 'spastic'
    }).addPattern(pattern`|spastic`)).addPhrase((phrase)=>phrase.setMetadata({
        originalWord: 'tit'
    }).addPattern(pattern`|tit|`).addPattern(pattern`|tits|`).addPattern(pattern`|titt`).addPattern(pattern`|tiddies`).addPattern(pattern`|tities`)).addPhrase((phrase)=>phrase.setMetadata({
        originalWord: 'tranny'
    }).addPattern(pattern`|trany`)).addPhrase((phrase)=>phrase.setMetadata({
        originalWord: 'turd'
    }).addPattern(pattern`|turd`).addWhitelistedTerm('turducken')).addPhrase((phrase)=>phrase.setMetadata({
        originalWord: 'twat'
    }).addPattern(pattern`|twat`).addWhitelistedTerm('twattle')).addPhrase((phrase)=>phrase.setMetadata({
        originalWord: 'vagina'
    }).addPattern(pattern`vagina`).addPattern(pattern`|v[?]gina`)).addPhrase((phrase)=>phrase.setMetadata({
        originalWord: 'wank'
    }).addPattern(pattern`|wank`)).addPhrase((phrase)=>phrase.setMetadata({
        originalWord: 'whore'
    }).addPattern(pattern`|wh[o]re|`).addPattern(pattern`|who[o]res[s]|`).addWhitelistedTerm("who're"));
