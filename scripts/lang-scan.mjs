#!/usr/bin/env node
// Language and coupling scanner: the ratchet tool for "English only" and "no ties to the source repo".
// Usage: node scripts/lang-scan.mjs [mode] [flags]    (see --help)
//
// Detection classes (counted per line):
//   1. Vietnamese letters with diacritics (Latin-1 Supplement, Latin Extended-A/B, Latin Extended Additional).
//   2. Unaccented Vietnamese words: whole-token matches against a list stored as SHA-256 hashes of lower-cased
//      tokens, so this file holds no Vietnamese text and never flags itself.
//   3. Path names (files and folders), with classes 1 and 2.
//   4. Commit messages and pull-request metadata, with classes 1 and 2.
// Skip: exactly one repo-relative path (SKIP_PATHS). Coupling (--coupling) is a separate count.

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/** Paths (relative to the package root, forward slashes) whose content is never scanned. Exactly one entry. */
export const SKIP_PATHS = ['shared/i18n/vi.ts'];

/**
 * Folders (relative to the package root) that record the move out of the source repo. They must name the old
 * repository and quote the words they teach the scanner to catch, so neither count is applied to their contents.
 * Path names are still scanned. Remove an entry when the folder is deleted.
 */
export const RECORD_PREFIXES = ['docs/specs/', 'docs/plans/', 'tools/extraction-loop/'];

/** The coupling rule reads the same folders. */
export const COUPLING_EXEMPT_PREFIXES = RECORD_PREFIXES;

/** Home-folder user names that are neutral (compared case-insensitively). */
export const NEUTRAL_USERS = ['alice', 'bob', 'user', 'runner', 'Shared', 'Public', 'Default'];

/** SHA-256 hex of lower-cased unaccented Vietnamese tokens. Common English and code words are left out. */
export const WORD_HASHES = [
  '00ab9b0c4e58c5e0b039cc4f5213bfd41c2d4e00211b618bae67cc33a32e73d0',
  '00c7ab7d2f3170f6c0c9d52394c4b4a69fe9bf3ab0e03e61d3196185081ebd54',
  '01459f1a01f08e6e86474d76f4240d2089cfe4f1bd30be9eb8f88247d7b54015',
  '019831bb994218c20607e9a7470797aed435f9a393c90f9b51d5b6dc625f4999',
  '039faaf0dd0ae0a39b72bbb2f4967079f056ac854ec044e3294ec765c6f45fe8',
  '047f9377e6ae199dd9c0a7d760f0b8d2a46aa09ed7f4a3dade1d3396090778cd',
  '04db248bd13040d52df9ada78044e23e9826953c783597340bfad2577de9aa0e',
  '05901435402754c98e1eb70d6a5ff1c6c011f08e855fdc96faf294d4c2a80d0f',
  '05b3b66d444b8ed761948161aa8e4b986d2df0588facc556b4c97dc60d44c286',
  '064768b9e1a5e71a76e083aeeb0baaa82a97851baff3e0df4d4b7c32f4757409',
  '071fa0a12e65ebf73ae9a850e2758b7fd6291e23f4478d91c448d17d3c125a6c',
  '08266b2f448575f2c3690e6697ad0637a1fe27a59e55004ec2bb6f0fa6ea4345',
  '085893fd1e94a14f219f155b1dba87b277ceba161722f3cd941d4dc10f5aeacc',
  '0b1e096e4c87e46e03bd093691d725fb03842cc81d405e5ea729c117fd06b251',
  '0b6f10d0160152a55f542b8239e22c9a190566f45abf34babd1e5d9eb8abe0cf',
  '0bfebb808cc1a3ddc1902327dcbe03cb4478838f30e00ad179d3b7ed47d21994',
  '0c238b6206a9461511c4ead27951781d71db611730be2c20ae19508f3bb0ecb1',
  '0c4e438c22b64da2d6c8b0e2e47bab39804ff7e57c96fd863fc5b852cddf8e33',
  '0ef7d24f5e933f31a5ae471d327cb129286787b90608c12f1227b964e48eff73',
  '0f22e5f1142fc5f439961429cb02ab5f0d6115d7251e90b717a1669aaac415bc',
  '0fbe8c80fbff870666ee9762ce21581fc4af27b505ecaece3136887d070e19df',
  '11df8f504dce4d00e3c2aeb202463455cb2eab7a5c1bb988ae25fba91242a509',
  '14d1368aadeca4830cd961c00e994826ea703880cd3ac5e88d4f8fdcb102ef5e',
  '154e62fe8cd1750b5694ccc78fa52ddf70c720a612b2b067c6c924d1af6b0065',
  '17855b20e64ee3ccc3c097ab9ea962a10db5f794829ad5b5737e7130b1fd66cb',
  '187c6c9e881d33ab9c94cb369d76f8d16e505143bd6fedbfe80ccf3f413d98d2',
  '190ccae968aa9eb87e7aaeadfa1092d824bcc17c8328614c02687b0e4f394595',
  '1936c215cb8e2824f9588a199393e1d2a68345977ba85f15a8893104ae7d4e6e',
  '19b92241dc3469de59d90b9ee64ac6036ab55225d3ef044e0f9a2b1006f04788',
  '1a08b6ac36bf48fcfd9f9344c0fc2d33a3a298dfcf7ac8536f671f656498a61e',
  '1c2e70a6a6801b11776f662589d39778764107711551975380adce1c4a4ad733',
  '1c9c5b8f16acc032ca89ec6e9f961b3edf2c4bd08c859810bab6575d7a611746',
  '1cf8531a22348eeb2abe9b891c939707aa5abfab759f1f6be7abc4a763968ebc',
  '1d6d3d56b9a9245a35e9bc15ad9f2da8c5e352c3c7d35e6572cf99e516519b1c',
  '1d7736836d36ccef00b1bf760ee4826415dc1a5ec6a18e60d3fc1810f007bc63',
  '1e2e8a0765d71bf9717605c4c78eb3e2c2b648d357c5ad507acdd66730e2ff94',
  '1ff69c405a41cda970cf36c6c8192247650ea952227fa1df8048e707bf7e8d7a',
  '209400a93168b367e9604f427bb1c5a56f546889262014e84f153a1d273cf631',
  '2170920f55a4c504f3fbc9bf3005635db8f0e141067ea0ef9152fc9273f1c1e9',
  '22b1f82e804e2c285b472ff9a37d6f7c3aedc489e273c223b04d39ede20b48c3',
  '23670cabf30801a3160ef30746eed381ec94c674e9ccbb004916b1465c6ed8df',
  '236fa9adef3f6271405eecad6a8b791983cd9ec35adc6db739cbf0bb9a8c4daf',
  '239be9e20e9ae0bd359f479d6a3fa10f8f5ed0c388c53ea0fb3cbb87cd27dd1f',
  '23c8f1bdd488e9bc079b81e4f2f6f6e5651359fdb8ed43c4287d1eb1ef24697d',
  '2412edbbbcd5ceb567b1d3c0a30a77000011825485b201e152441ea25f1a91af',
  '2466fcafe0531db08547f61d39bd340224e92f3410d58837e04cb845d790b970',
  '25509e01f54a71e31d4fa8ff1b802f19e3e50a56bcf333cc6fe76435a135c9da',
  '258ae09689bf5b253b84bc3913f3db99460a962ce1b976b8019df1527dfb4497',
  '258b18730b6ae6ebc7f4756d516664e57876fb4eb63cdfac691149529c93981b',
  '26c0b9c67268ea0882d434f8ca083ba5f5770ab14d12a218534ebf8a27527df1',
  '276c72b7d92b7ee00970becea71f7e5bfde158225b0f502b820efd42641bed30',
  '288df7dbf0fbcfa261bb67a0caa25f0b7404c2d105064612fca35746342bdaf3',
  '290bd5131daa6a8785b1a9484809c0fad873c563c1dc0e3561a44d113124cd3f',
  '298bb026c78ed2f0a429b148b6b8d65c4e045c35c04d3526082364d60ee213d7',
  '2a4af797ec28d01161e381cb6e8af633c5bbb6e3e227c04565efbf16da0b1a8a',
  '2a8fafad1de51f1eea3164a170cd56ea475ab337719fb5c59f13854ddf2983aa',
  '2be4993d4fecf2e431ea89e29263ec0cd74ee93fd01877420eb0d2cef14311d7',
  '2c56977201d8b045f629a4bc349ea86ed3ae947d79cd65b4d0d4b79e0bfda3d7',
  '2e0c76e1c7fc1f5d5ff7e52a368922c9caed6d339b17a762041f93cb4833c889',
  '2e6b2e57778fc5149ee901db9858fdde930abe64237fa0b07d7b952b303a8cb0',
  '2e95ac47e6fc00030224e20194ce3a9bfa03717c32b5fa2e95b111d7053916a6',
  '2eaaaaa039aaace920d32dbde0ac7771ec6ff1eb6fbffe1c8aef1f4377253506',
  '2f0aa5a8a5d8c57f2b156b12879eaa4caa8555d8ff0ecadc8b89ea31ba549494',
  '30624c8464d98ad638766e4a9a22f03a9465b3547963dd438a29044b4b6d0ec5',
  '307867f8eb09652087a67406b9ae8fbaaab759c19e064a766ed4d4f4697d5235',
  '307e75077f7f74c0e9a102a9f7fd970218cbc8187f144c55114c5670a62ee425',
  '30ee9c81e22076a1ce6b7894d5f45ba5e16cf33a496e91e179addb961a474453',
  '30fe9d8526a58c5bcca1c9fdc543f1cf458601147cd89088a3f5f1e65b27b19c',
  '312663de84ade8964aee7b679062e3a94aae64bbc2d2a096b807a81d9396abb7',
  '3220a39228bc7a963b29aafcf511c8a83c17bc719b97210757123c93845060a8',
  '326de1793f3d4feddef3a7579a05905c2b2e639a43263019329cc3f0e5125aef',
  '33710fa28957db430ecae239f7d676ca5efb898840f1b5231eba491225934bda',
  '339562ef8d7d47846d88cebd706f68f4a41ec8446498cc83ac8eb6819de82268',
  '33c35f8c8515b13ce15324718eccea7fb10e0c8848df3e3e0a7c0e529303828d',
  '342c441ea6397ffa71a19b4eee96c13c37cc59c948cc81d4057f86367700d98e',
  '36232bddefbc751d60c9d1065435b4245ff95909920c18be65847e30c7a6f164',
  '36742df21ffd2fee3951ca7e5fbbccdb9700c4e2ab7735ad602130216d4413c3',
  '369757bae59680f50f615fab61a78ef7c3476e9d71c11a443aafc66ab6f164aa',
  '38e47d25e4e59ccf51f8d6ec137ccede2aded1746c6a2a120fde21c71d1da850',
  '398e87d2a3b5b1eb31cbe76071643f7ab7e1ccf82aa2a317dbda353782ad9225',
  '3c96cf91650753ed958ecb1089ffa5acdadc3931b8be4373c31280d1ce1b7758',
  '3e403e0f19bb27ca7ade0cfc46d2f457a61053a3f91758140d3f4338d121721d',
  '3e6062f7d2a10dfd491f71151023730270e4a6a01d0fed78b4bf0e58e7294f29',
  '435006d9f697e80c9b41332131b1c751523df0f1c900eb6a660294c8f52110dd',
  '43a9c4b1f336def53050a2b9b567af75cf4edf94c55fb49d6f2c8cc20ba17a3d',
  '44cb18225e0bd783de306369aac1dd0328a968754086246c634d086c782f4bef',
  '477ed0b8b93cf4a3af48494c16c3426852222e18a998d4d5f1cfde7856dfc261',
  '47d21fb4481381e84d4395fe14126396fe40e872abdcfa973f6c66c12997c35f',
  '489147936dd3e50e2ee1927cfe749c7842d8628eadd9672f6572bbe4b6bfbb63',
  '48d37ca5236a7c9511e78e1819ef776851b031de27517e518eda198198fc81db',
  '49205ac18d63a4d26b1c890aa843f6c0a8ac98ebba9c73fd65b262c15c9aec41',
  '4a165184e6848049287dd45ff79e4162e074e70057b8345ad43ec8f01b8f9473',
  '4a64585238a3b3ca5b8e12b430ca6dada6fa51187a3aca9615562a5ebec93cd5',
  '4ac1a18511dc7f0d50b7d7848d52c895095ee349b5d8df3c707caa66420fab2d',
  '4de6bb4e4a6c2058981c96726e7142bc487588eadf7f315b1d7dc56e30cc51aa',
  '4eb377bbe9fac8bca8ebcb65c740b8b6ed1be222ce670844dd0cec46e0d749df',
  '4edd7747c2b180d15863917e98e522cf3f15d89076b3d73ae93e50936ce18fa2',
  '4faa1e5614f72bbaeedc6f67243600d0af604a814ce863f7eb015c9de3af18a8',
  '507cbee575ba94145df951ee49f3ca16f47ad2e77c2ef4c963646c9d05318326',
  '50f9ce941ee464226efefc6ceb82b7fe092b40ab6e415ff84dc19ed7c415daac',
  '5111846f9b708380ee90dcfca22e4a5a7e0a8798167a26da30783c3d4bd32247',
  '524140e38e28b2c692cc45bbe7ff31a0ceb7845f00cd9e5399feea05370b5a23',
  '526ac9bd6252230958a8e3e6b200913405f9d44044aef51c6d60f2ea15bd6dea',
  '53000e196ba02bdf57cfc98c9f7a002fd7ecf69aa0d63d8e7a8b2d9e42881388',
  '53886cdd25642bf5148fc8e3786004256d99ee869982cfd86623c6d6e603ea9b',
  '53b95a34f534b719dedb60ef39d15a1367c77743978708c6c24a7586d2f7501a',
  '53fb401cb14639f9fd2ecf4ccd4647a51a3c70a022a8e38403dfd72770122cd4',
  '5446ad62fdb838b81bb6c2a9d6522201ed140756c8941090ca7d961e87808f59',
  '544fc8545c8d08c5bf4b4cf3b3138adb5b407aa8316313a67fe940232a53fe14',
  '547aff61ce29dc6846a301814f237959342b2baa43b79db745521a3f1f809697',
  '558da7cd1d11ec023fe1b03223ff081a4f55b2ea10cc919e0d3a9e1008ff3dc4',
  '55bb7be7914170eaa696a8e0b6d091ec0c148ac9e08f454498186e68a5d91c6b',
  '560b14e5c4a4c8d510a6db0b5845d66004033adeea4cedf0cab317ca732ab8df',
  '560c48d6c73e72bde5e58cf4acdf867e2ab1600dbc7f805ec5e901c3d367feb4',
  '56d6e14778ef2c2e74565fd8579472066037cde720e6f75215d5a46891bf148f',
  '597f893800f49a90268af0a20a1ca3d73520b25abd2eab972a8666fb815d07f5',
  '5bfebfbc0a01b9d3ec926d2f14db66572774eab16d155d4dac0acfc0e0f5f1b6',
  '5c11b43be7e405a6b4c6c0e727f54ef919cc6116c223db0f93698a613bba5d47',
  '5cbbeca04af466bd20e7635c3ffc3200a02072a0bd4becc97daffe8724efed89',
  '5d6ebc05d0f2e0991f27f55eed0ade4bab64a2aae5c7c6abb8656ae54d921234',
  '5d6f149eab79824e5f3a1247b167a79688a95b224471e34003cc908f83f3c97e',
  '5e4d82220bd8f92797f463a0b90b4764c1d86dcec44de97aca201b179c3ef10c',
  '5f50ead80247f155bc484b69b975ac47bb253134281222ecff7d1898891cea08',
  '601c2afce6b60faa237a922451e16c9848c758a087aaa2222d79d81c52225b8a',
  '61a54dbfaac2e0c574f446d5b7d6b4105b3138496fd912b43ba40b031b7226be',
  '61e8c34317f455abaeade7e13ba71f372310bcc2dbef4406721a0767b4b33dac',
  '62bc866b9fb618266fcaa2749c373ca825e30ca9e443d25d976c0757cce6d874',
  '65322be4021bbae80eee6a2dc80ae2401fd30d14f18249b00fd812313b88a33d',
  '65c5ed098a4ca5ef8198227c6547a726e7c4c2c20be6f67d07699159de6327b1',
  '669cd16498cb442216f0a7e48d80e36dfd1d603e42d71bfa09ae6f65ae208d5b',
  '6a58a9621d1cfeddbf75f25ae02c3488b67ca047cae3c966c6660b7605909b89',
  '6adf2daeb84436e415cbfd0996ef351b6768639980ee97773966b0572d1bfa43',
  '6ae6c9e65bfcd71db43c104ca6bd45fbebfdf412523cbbdfa0334bc1f391679f',
  '6c55c071959dfd9d8bed0778cf0de13ea7a987105a160632b568213ba83a6d82',
  '6c9a52bb4a945c9c44e61a00eb5f719dbb4341334578bacd750a862c18d3ca07',
  '6d447457333a74d90ff452229938c625cafde021dfd2f207d245275785099012',
  '6ddf28f040f22b18f96268e6f628eb8be25f11cac78669a118746457e021295d',
  '6ee77a19b5ef29b01bf24ad26168a1458d32368efe6173c10d740306d8634b75',
  '6eff9efbe9ec4716826e179e54e763810cddf48cd0e73c9e6ace6253d377e3d9',
  '6f32ebbc1ee9cf3867df5f86f071ee147c6190ac7bfd88330fd8996a0abb512e',
  '70078967ae97261e0134b27b7b830cf7bc423fc4b3fa94f1eef59699bfa7639a',
  '70f33435729978844b86acad57440ebda4c45cc3f4fd4677d498e37fa296557c',
  '713ac30379cf5cd916765260e7583daf0ae9d5557727c3f62493ecb5f1e31f55',
  '730afd6f0a9d2efd994bdbb905801937ead64b7f4ed7fe93724d6966297f2fe6',
  '768021b7ac85f0fb8fabbde8a30e2e36f1b8512e756d277e0e5aaa5555d02949',
  '76abef6399af5e8b910588b4d6746689013a25ea0f322918b15cb92b51a3c83b',
  '7710e1b184cbc633d23324649f6f50c0650df3d2bbf939ed9e60763bd9610921',
  '7797a2701fdb8aaa9fdc0e4eeff84fbdf3782760cc4ed1c15cf81dd3842d50c1',
  '77ad0c84561ded9d809598337fb4003e0e7008870654d21e20d828ceaf0e6668',
  '783e070adf4540d7b44afa94322c978fd2af319f4b746745624a4edcc6fd240b',
  '792b1f64efc83b8011bf75880cf918cd7fa339cef2dd701fe30a2aaa46485c12',
  '79d7c5ec74a4a109f92c37c3d958572f52a7165683fba97d7ca31c8970a77e27',
  '7a107cf74d43c2911bc14a3d60781c6aa3ab884e825cf6e69590a20f84085189',
  '7b4384b9f8d27725dd7a33699756b4dfb22e6e69197b34227625e17d409d5a12',
  '7b6e2287c7edc5e9bc5b339092b492feae27ed8bf7f9e1a9f469594e1cc415cb',
  '7b9814c393a592e6d6a1a7ff0353d50f958db7bf1804eca25e651b4c5fcae0b8',
  '7bdf308953c391442b156debe41837da5b1bdff809fe3f4eddb3d7b17d2b05bc',
  '7c45d237d2c93594e7d0ed795e4bef5f050314cc725844cde607ee63d2a49ba6',
  '7c512b48ba8aba50a396d19cc33884f60b9b6474c66f4e9c927f36742d13c6b1',
  '7d43fbe6ef28b115d7d56046178b098162d5aeff5bbab9c5c2a9c0176d535496',
  '7e52d432c58a01b3c2210966dda0c5a1c7c1f15bb1d16504763610b41ecf9462',
  '7f80c22947699b784488170675bea2ab3f696677a610bed1e0d5747d079e2e97',
  '810f319e718e8621bbbc8e884d6df765612c5feae96da9cc3b6e67ee63ecd780',
  '8253af0014baf6edc4ef360f97d962984dcd74f88a9390df8d8df63fc95a7085',
  '83324160d43bdb327e555b6be8ce654e8c693e95c0a4f10817499bb9e0224a1d',
  '84ef2ccf3e4a427c8343a872d74ef83196e6a4b8fcae6a61580859b1350390ea',
  '869958a219ebfd2e729fc207758b313d59e07741faab181d15b8b0bf0e3554b7',
  '86c5f095767aa156eb94637c963c88e287d7b1f85533798863b39e4d91cb8b10',
  '86cf391a3c76ac8ee56555c1e54c9f921564510e9a9e8265c9cf82c5e1c4c269',
  '86e4f85b37d10d4de7683dfc80feb6c0a6ee8f2b27d3f98974cefb02dd4c43db',
  '8b3ea8e29f04e344161f9e528c8a669658cb8824645f2a93f491a2c66f69b864',
  '8ef6e456b241fb0308771f23bcad3522140504c76d2363739a3621171822ff22',
  '90391e6bdc0e07c9f781df1d13189f901b10466d83414a82d805070fdb14fbbc',
  '905bdba6963fa58f7cd527610559fe66f64db539d39dae658be119e97d8f7f5b',
  '9323321c946af98e27b68a3bfd9deacf5b0cedc22ef77c92bb43988fcd65a1dc',
  '94162ad1d8f25c1037cdb7d37d7c68cbb4302d5055f8bfedefa46e66e823106f',
  '947c09f36bf909dc9999a6f82838be56f836169a5f3026cba8940d74dcb702eb',
  '950af47118640bc799ec04d46ef52150514e46e6ab321fce9686e65cce563144',
  '999155115e010ad2b6e5876c29122388de56313117dd53e425a344adc5aa4de9',
  '9bd3c3c7c71810b5a7526cafd8036113b0d750179a6a9a47ed7a0563bd7dd8cd',
  '9befd30f3f99920cbca4956137dbdf283eb37ac78f295f215aefd15781d37a25',
  '9ccb7160c82d43d4ceded4543860a84f45897fc0c7b75ad8c21e7e833e7e403d',
  '9e2bbe8db9faa66d8d2eb0bedff8246b2818e7513b113d93f7061c818175116d',
  '9e59c4d28f96f85747f58465073892aefec9b2301ee857dcd4027e5e56713fab',
  '9eafa1ef13a99a5833a290aaea40e5299ad19d71dc3c2e2f1b7be42123c6cced',
  '9ef78ba5f2594c24944ce9a90f2a6358d260a7cc3bb7db8e37f06c5d41249eef',
  '9fcce34dc741bbc0e9ccceabee81b3f8435552a3176169a9b12e5ee4b9de631c',
  '9fd30cbef3d869944b640fddaaf4d5f834a35663f88e7b3cb5644102b31b3de4',
  'a00725d436f6420d594c88c94a3bcc1fa2c1806da9d5d6f578a065fd1e5e142f',
  'a09f9e723d5a366b356143811d77c239d5c21e48a0bf9cef53be9babe528e7f7',
  'a0aaf2bf3dd5dd6c27d716ecf65df1e2980e6dad51615d3943ecd41568b71c8f',
  'a1e81b381373cd925fdb677bd72381e8e588c17092c1d9b16872aaa0609903e7',
  'a4320ffbc98075ebff8222ea30356950fe7001a5ff2990c240e1388aa9746fd9',
  'a46b3a79480a6ec4a06a4b3ef400551e3722be7c8900b50aaaa14ce6c777bb00',
  'a4f0e1d1b5eb23e3482a14b4a9d4e8106e83f7887471e4a73c2557ade280bfe5',
  'a53374150b5e4a4c59606603b9fb38ad4bd924bc93f7b609d3c2e3b1a0c37c9c',
  'a5d9a53097f41fe4cff463a5b0d8fec6bbb6bf363f642a5cb56f54f9998a4f81',
  'a70dbf38039f61f4c7e63720ab5ad0fcdd73d13c4483d0778ce392b213886f24',
  'a923d01bac74b33fa99f1c0699dc649fb971df00760a356602a4a43e4ddb5800',
  'ab0b8d7c8bfbcc8f894f1ec15ebebc55a42a817938c1d8b8f47d964573bf5e18',
  'ad3f5ee22b3ac97ec635a0e9e4d18f4c17396c379844ff6e23f0a24dd6b42bd6',
  'ae4743afb621676d91fbd995954400c5d55a016474b815ada8c5ade55c1b340f',
  'afc8e16842061ea3dbb023bf5f08d1bc3a728429313fab0cba30f60954ff9064',
  'b1688cbab7e2c8ad7cf619047e25eed6c9e344ed970badcdacd0e9ec73b08626',
  'b18346f8d14c8395cf5cbf14fe6a62c4890985ef43f1e97498379b86000abf10',
  'b1ebc709911cb51a7b0c9b4f6c94cb50a1c858dffd5c8b9904239f4b714f74a5',
  'b42dbc3bc790ecc73718210546f2f8a9ac6fcdf000951600a83338e88879222c',
  'b5060bc59a7d7b2700388b5fa24b3ce1a14b8f88fa1b3c14b2896ff8aabc0e1e',
  'b6a0005c7e9085a729bb395b3d30aac3ee4c5155f9dd570a41bc3a82614b31af',
  'b8181b97412d094f206a9fb265dfb4014d3460d32c27015dd5a30ad2c6205af1',
  'b8d159afb5cad34830a6c9e2d4ea27b22400641956634bd23f1602c0e7fe6450',
  'b98e5e19a22dc2dac1c86d2d63a085c5266a1cb3b50813003b12ffe9e1a3aebb',
  'ba3d4b19f4deaa8fb663c46f153847369c64fc07a63e8b531439762d2b4cfcba',
  'bbcfcbdecdfec348f558015cc36d01ab27081c2cef9dad3e44d9277b46de2f72',
  'bbd887740d7e694269fec8b0166eada4f82999539f870e9a9a27b6bda39e8863',
  'bf948b5c4ebe2247198f00d0564341673a9882b937bce345e566cc3f7add2b22',
  'bfaa65a1b7a6da9b7324b45de77da673cdf9a008aae4986ba818076826e347e6',
  'bff66120de8ba0289236b61a5d7db6db953bb462f31be21046446ac8cebcec55',
  'c08c0d279a7fc15dcb16bbf59e262bd775241b535d5d31ff5b6f843b25a85e5c',
  'c1f6e6d43dd4bb984393551989c80f661f3859082824478b9f50cc416a332776',
  'c237c8f5eac442e87046bfdee0b882a93cb611b0103d762dd7ab6d40532d90e5',
  'c60293f8c4370b64f5bc4ed8bd673cacf83188630c56c6938afb709c0819db21',
  'c646ba5feefe17ab9fa629e09d8d05380be1c12ecbd7f0322838713747595ab7',
  'c6b36f2de6aa8b7e9ebcf332812c54e9d41b1b614bda63106cfae239a3aa2835',
  'c6b6e312c4e646370dd0545e5cf366f381bc5a6c65dd4e027bc6d6fe410732ea',
  'c7c4a8ed625abd7b813c7dbef6d7ffc5a312944785725a6c05913ef735a9622a',
  'c844fe7301354bdeba88a76932f053989e2c26c7a4d652b560555609187c4688',
  'c8c30ae87ca9d493ccc902e0b291771056873fa80448714b690182d8e981bd7b',
  'c980168d0b3c7ade451f97c7066b03f1d38203aa9058e9ce53eaf1d8b48cc043',
  'c997d00f91c170ce5ff96951dd328d30fe7385935d0d875c87a205870d6b2d35',
  'cb83aea2a76c47853d1bad74f3ee82157afb34c62dd1e0a37a1f03fdcec520c9',
  'cc244f13cdc4e0f1c7a1b77b9bdbe7d12b616431f7a2db25d4b68fa169ffe91f',
  'cc71991f59c66e89c47c90393971d1e4b05b99078adade985b5da78d57059747',
  'cfffae1989bc82686f683d5cb0e383cfa46885c4b82686204fbedb2c517f29ad',
  'd15d0db9d1ccb07df5391e7cb44b00753c4d5815e674e227f010c08d5fbf9951',
  'd19cc6e906a11f97b6de5240c0f6e595ec88269072ed6dd889d7fee4600c614d',
  'd39d350b3835c7dd15040ae50eab49bc92ede7ef9c49230f38ff665147eb038c',
  'd510ce394c546e3d2de98b97dff4b13854a46bc5f67a339be1a69aaf064bf965',
  'd54170f31396d8c2541e1d527b83839b03255205e6a3b190e3d895d105ad2c42',
  'd646b3d1e74d26e2d1a7e19c9092b8d80ead45d199f60a14b482808a4f74dcb3',
  'd6a72360eeb5ee83ad84df5da11791b59f9b26a295165a7a44719a6e3fcbd4fe',
  'd79f78d58f89d73b450e15c150d3af2673043591889575b00dc5c62ebdec137d',
  'da176e994d1c243bf98361ab6a8c0ec8195e38aa7ad0013bd6e6140f35f8dd92',
  'dceaea9b3add0a73a05c068f908ccd7f3bd1118ec8a8b9beec0efbe2e0e0e4f2',
  'df0724e3b90f5fc5dc684b0837a53ad575851014008a5db28f4c8f5cb19baa50',
  'dfc25e5532f03a693d9c3ef3753de2bc49262fbb6470e7845aa6afdf0ea9566d',
  'dfddb3bb2fda34f40185f44b2b69399a41662d32cf93fc4ef71c5034a4706757',
  'e05cb8d051a2dfdc559091c3a8139d44039fd3060a218e1738dc4d1f6efd63a3',
  'e07f52f45ffcfe004432b8f96fbe401378c255fbae4ad87ee64cff0cb8a77227',
  'e0daa611c0a626d5eb6cef18f7e4cdbd1086763e097c32d984d304df3a1e2b6e',
  'e21c198457d9a6b0d4c57b610d6d5697afb5275fa82323ffdfd7a60dd7783a6f',
  'e2fdbd07679ccf8de4f3605b84a83eb2d75cddf5e96a2a15f19587f984403b98',
  'e32e2774939d77f03ee6e90d3c97bf0b912e588da1850b2a484ba13a712fd829',
  'e4bc7fd47d2f6e2762b0628b4d7eed7cc5d81e5a0cd1e818c6e846b4383f0d4a',
  'e74c1a2d955f17055e994246162073ec617f6aab69eeac79bf641c4415f82ce3',
  'e7b389aa7d6312c253d0446b87c6e6840564049fb119c194e4311c8aea508e5e',
  'e96bb6bd4835c3d6c0fb84814d22951d5cd4553d566e8fe3973d1155a4ad963b',
  'eb6cd736e8340568a936f4a389973b5bd912c76a779bf0b6f4460daf5c617b88',
  'ec1ee7c71fa69228263c41bf18fe5e4a469da3e760a6c25361374cfea16dd06d',
  'ef850ca051a5e21ecd09922052a717fde56aabc79ffb1185daacf61dd00fdeb2',
  'f16b49f38336a58eba5a466ed614fcaef7ec13b7a107c6bdc170d63993239dc5',
  'f195d3ef54fb0a1c43b0e7cd1526871d3c12961db0104df0b068902cdbf60bc0',
  'f2b6c11dec1b1c90183f570520e2235b27cd701c2183e059e74ae5446e5fe65c',
  'f31cec2fc48221fb214bcd64fd31f90cb93ee9bfe074c6a621a21936cc4f82b3',
  'f3adeea456fcfe82d0f3053d1aa02a4ddeb023b7b8b5830530d2ea139903d05c',
  'f543cdc4507065052f7021af4271495412db83c6952b6ff2c6d2a322ed44073d',
  'f5ee8e42fbc6588ff531cad28acaac1df24dd25e0cfba38b20fad56eb1f571ce',
  'f7045ea9476fcf93f2d0a5a63893debaacb2ac862f956b18c70c08dd6dcdfd56',
  'f7e6313576233a6e49e0b6e7cc90e39c7457abd61985262552ef7d7eaa2fb208',
  'faec19c1278b308a886fae4a2f00dd411c38fda363a1d5a2f95fb3b720257336',
  'faee6c1b2ead7be4a2c235bc47d42885b71a6b74fb49c074e5fd06b91ce6ce23',
  'fbef4daf0f40aed4012680ae474a5d5c4985a25d50ec35c440b061990413dddf',
  'fc60dfc45dcf693f71be01905a527ce158e0b3fb514d9baa720040b1d9ce313e',
  'fda092c52fd767b6a4c280e5f69fc49ddbd87c563fd9c6a1674e288eee9dd65c',
  'fe575edb20d63485acfdfb7024c8285940840813b3d3d29c2cd6ebb9e323923d',
  'fe6b57e537d2ff888ead8bc8484965b34838088143d9d7f12c82c964104be641',
  'fef48866ddf2522fc7dede28b39f436da085883503b452716eab6a605073a140',
  'ff47bb1aedd9ede5de2a7bad5131d5d109bdf397b52c2b95f5fda6e2d755dc67',
  'ff67c76485743539dadbfec77932898e831a165d8039776ebf3596ccbb6bfaa5',
  'ff696c7a0eb371cd5b944879c6ea75cc05ae3a7547fb36cc3dfc7a6e3e6d1b55',
];
const WORD_SET = new Set(WORD_HASHES);

const BINARY_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp', '.avif', '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.zip', '.gz', '.tgz', '.pdf', '.mp4', '.webm', '.mov', '.wasm', '.bin', '.so', '.dll', '.exe',
]);

const DIACRITIC_RE = new RegExp(
  '[\\u00C0-\\u00C3\\u00C8-\\u00CA\\u00CC\\u00CD\\u00D2-\\u00D5\\u00D9\\u00DA\\u00DD' +
    '\\u00E0-\\u00E3\\u00E8-\\u00EA\\u00EC\\u00ED\\u00F2-\\u00F5\\u00F9\\u00FA\\u00FD' +
    '\\u0102\\u0103\\u0110\\u0111\\u0128\\u0129\\u0168\\u0169\\u01A0\\u01A1\\u01AF\\u01B0\\u1EA0-\\u1EF9]',
  'u',
);
const COMBINING_RE = new RegExp('[\u0300-\u036F]', 'u');
// Long base64 or hex-like chunks (hashes, data URIs) are not text.
const OPAQUE_CHUNK_RE = /(?=[A-Za-z0-9+/=]*\d)[A-Za-z0-9+/=]{32,}/g;
const TOKEN_SPLIT_RE = /[^\p{L}]+|(?<=\p{Ll})(?=\p{Lu})/u;

/** SHA-256 hex of the lower-cased token. */
export function tokenHash(token) {
  return createHash('sha256').update(token.toLowerCase()).digest('hex');
}

/** The first Vietnamese hit in a string (diacritic letter or hashed word), or null. */
export function findVietnamese(text) {
  const s = COMBINING_RE.test(text) ? text.normalize('NFC') : text;
  const m = DIACRITIC_RE.exec(s);
  if (m) return { kind: 'diacritic', match: m[0] };
  for (const tok of s.replace(OPAQUE_CHUNK_RE, ' ').split(TOKEN_SPLIT_RE)) {
    if (tok.length >= 2 && WORD_SET.has(tokenHash(tok))) return { kind: 'word', match: tok };
  }
  return null;
}

// ---- coupling -------------------------------------------------------------------------------------------------

const HOME_RE = /(?:[A-Za-z]:[\\/]+Users[\\/]+|(?<![\w.:/-])\/Users\/|(?<![\w.:/-])\/home\/)([^\\/\s'"`:;,)\]}]+)/g;
// Claude Code's encoded project folder: the drive letter, two dashes, the word Users, then the user name, with separators turned into dashes.
const ENCODED_HOME_RE = /(?<![A-Za-z0-9])[A-Za-z]--Users-([^-\s\/'"`]+)-/g;
// Built from pieces so this file does not match its own patterns.
const DOCS_REF_RE = new RegExp(['docs/loop', '-console'].join('') + '|' + "'\\.\\.',\\s*'docs'" + '|' + '"\\.\\.",\\s*"docs"');
const TICKET_RE = new RegExp('\\bLC' + '-\\d+');
const ISSUE_RE = /(?<![\w&])#(\d{3,})(?!\w)/g;
const PLACEHOLDER_RE = /\{\s*\w+\s*\}/;

function insidePlaceholderString(line, index) {
  // Is `index` inside a quoted string that carries a {n}-style placeholder?
  const re = /(["'`])((?:\\.|(?!\1).)*)\1/g;
  let m;
  while ((m = re.exec(line))) {
    if (index > m.index && index < m.index + m[0].length && PLACEHOLDER_RE.test(m[2])) return true;
  }
  return false;
}

/** Loads the owner-specific patterns from `<root>/.lang-scan.local.json` ({ "patterns": [regex source, ...] }). */
export function loadLocalPatterns(root) {
  const file = path.join(root, '.lang-scan.local.json');
  if (!fs.existsSync(file)) return [];
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  return (data.patterns ?? []).map((p) => new RegExp(p, 'iu'));
}

/** The first coupling hit in a line, or null. `localPatterns` come from loadLocalPatterns. */
export function findCoupling(line, localPatterns = []) {
  for (const m of line.matchAll(HOME_RE)) {
    if (!NEUTRAL_USERS.some((u) => u.toLowerCase() === m[1].toLowerCase())) return { kind: 'home-path', match: m[0] };
  }
  for (const m of line.matchAll(ENCODED_HOME_RE)) {
    if (!NEUTRAL_USERS.some((u) => u.toLowerCase() === m[1].toLowerCase())) return { kind: 'home-path', match: m[0] };
  }
  const d = DOCS_REF_RE.exec(line);
  if (d) return { kind: 'docs-ref', match: d[0] };
  const t = TICKET_RE.exec(line);
  if (t) return { kind: 'ticket', match: t[0] };
  for (const m of line.matchAll(ISSUE_RE)) {
    const digits = m[1];
    if (digits.length === 6 || digits.length === 8) continue; // CSS hex colour made of digits
    if (insidePlaceholderString(line, m.index)) continue;
    return { kind: 'issue-ref', match: m[0] };
  }
  for (const re of localPatterns) {
    const m = re.exec(line);
    if (m) return { kind: 'local', match: m[0] };
  }
  return null;
}

// ---- comment lines --------------------------------------------------------------------------------------------

function letters(s) {
  return (s.match(/\p{L}/gu) ?? []).length;
}

/** Non-empty comment lines with at least three letters, counted per syntax chosen from the file extension. */
export function countCommentLines(text, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const lines = text.split(/\r?\n/);
  let n = 0;
  if (['.ts', '.tsx', '.js', '.mjs', '.cjs', '.jsx', '.css', '.cts', '.mts'].includes(ext)) {
    let inBlock = false;
    for (const raw of lines) {
      const line = raw.trim();
      let comment = '';
      if (inBlock) {
        const end = line.indexOf('*/');
        comment = end >= 0 ? line.slice(0, end) : line;
        if (end >= 0) inBlock = false;
      } else if (line.startsWith('//')) {
        comment = line.slice(2);
      } else if (line.startsWith('/*')) {
        const end = line.indexOf('*/', 2);
        comment = end >= 0 ? line.slice(2, end) : line.slice(2);
        if (end < 0) inBlock = true;
      }
      if (letters(comment) >= 3) n++;
    }
  } else if (['.ps1', '.yml', '.yaml', '.sh'].includes(ext)) {
    for (const raw of lines) {
      const line = raw.trim();
      if (line.startsWith('#') && !line.startsWith('#!') && letters(line) >= 3) n++;
    }
  } else if (['.html', '.md'].includes(ext)) {
    let inBlock = false;
    for (const raw of lines) {
      let line = raw;
      let comment = '';
      while (line.length > 0) {
        if (inBlock) {
          const end = line.indexOf('-->');
          comment += ' ' + (end >= 0 ? line.slice(0, end) : line);
          if (end >= 0) {
            inBlock = false;
            line = line.slice(end + 3);
          } else line = '';
        } else {
          const start = line.indexOf('<!--');
          if (start < 0) break;
          inBlock = true;
          line = line.slice(start + 4);
        }
      }
      if (letters(comment) >= 3) n++;
    }
  }
  return n;
}

// ---- file collection -------------------------------------------------------------------------------------------

function git(root, args, opts = {}) {
  return execFileSync('git', ['-C', root, '-c', 'core.quotepath=false', ...args], {
    maxBuffer: 1 << 30,
    stdio: ['pipe', 'pipe', 'pipe'],
    ...opts,
  });
}

function toPosix(p) {
  return p.split(path.sep).join('/');
}

function folderOf(rel) {
  const i = rel.indexOf('/');
  return i < 0 ? '.' : rel.slice(0, i);
}

function isBinaryBuffer(buf) {
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

function isBinaryPath(rel) {
  return BINARY_EXT.has(path.extname(rel).toLowerCase());
}

function couplingExempt(rel) {
  return COUPLING_EXEMPT_PREFIXES.some((p) => rel.startsWith(p));
}

function scanName(rel, folder, acc) {
  const v = findVietnamese(rel);
  if (v) acc.hits.push({ folder, path: rel, line: 0, cls: 'name', kind: v.kind, match: v.match });
  // Coupling is applied to file content only.
}

function scanLines(rel, folder, lines, acc, opts, startLine = 1) {
  if (RECORD_PREFIXES.some((p) => rel.startsWith(p))) return;
  lines.forEach((text, i) => {
    const v = findVietnamese(text);
    if (v) acc.hits.push({ folder, path: rel, line: startLine + i, cls: 'text', kind: v.kind, match: v.match, text });
    if (opts.coupling && !couplingExempt(rel)) {
      const c = findCoupling(text, opts.localPatterns);
      if (c) acc.hits.push({ folder, path: rel, line: startLine + i, cls: 'coupling', kind: c.kind, match: c.match, coupling: true, text });
    }
  });
}

function scanContent(rel, folder, buf, acc, opts) {
  if (isBinaryPath(rel) || isBinaryBuffer(buf)) return;
  const text = buf.toString('utf8');
  scanLines(rel, folder, text.split(/\r?\n/), acc, opts);
  const n = countCommentLines(text, rel);
  if (n) acc.commentLines.set(folder, (acc.commentLines.get(folder) ?? 0) + n);
}

function trackedFiles(root) {
  return git(root, ['ls-files', '-z']).toString('utf8').split('\0').filter(Boolean);
}

function scanTree(root, acc, opts, { content, prefix }) {
  for (const rel of trackedFiles(root)) {
    if (prefix && rel !== prefix && !rel.startsWith(prefix + '/')) continue;
    if (SKIP_PATHS.includes(rel)) continue;
    const folder = folderOf(rel);
    scanName(rel, folder, acc);
    if (content) {
      const abs = path.join(root, rel);
      let buf;
      try {
        if (!fs.statSync(abs).isFile()) continue;
        buf = fs.readFileSync(abs);
      } catch {
        continue;
      }
      scanContent(rel, folder, buf, acc, opts);
    }
  }
}

function scanStaged(root, acc, opts) {
  const names = git(root, ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z', '--relative']).toString('utf8').split('\0').filter(Boolean);
  for (const rel of names) if (!SKIP_PATHS.includes(rel)) scanName(rel, folderOf(rel), acc);
  const diff = git(root, ['diff', '--cached', '-U0', '--no-color', '--no-ext-diff', '--diff-filter=ACMR', '--relative']).toString('utf8');
  let cur = null;
  let lineNo = 0;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ ')) {
      const p = line.slice(4);
      cur = p === '/dev/null' ? null : p.replace(/^b\//, '');
      continue;
    }
    if (line.startsWith('--- ') || line.startsWith('diff ')) continue;
    const h = /^@@ -\S+ \+(\d+)/.exec(line);
    if (h) {
      lineNo = Number(h[1]);
      continue;
    }
    if (cur && !SKIP_PATHS.includes(cur) && line.startsWith('+')) {
      scanLines(cur, folderOf(cur), [line.slice(1)], acc, opts, lineNo);
      lineNo++;
    }
  }
}

function scanMessage(file, acc, opts) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/).filter((l) => !l.startsWith('#'));
  scanLines('(commit message)', '(commit message)', lines, acc, opts);
}

function scanPrEvent(file, acc, opts) {
  const ev = JSON.parse(fs.readFileSync(file, 'utf8'));
  const pr = ev.pull_request ?? ev;
  const fields = [
    ['title', pr.title],
    ['body', pr.body],
    ['head-branch', pr.head?.ref],
  ];
  for (const [name, value] of fields) {
    if (typeof value === 'string') scanLines(`(pr ${name})`, '(pull request)', value.split(/\r?\n/), acc, opts);
  }
}

function scanHistory(root, acc, opts) {
  const prefix = git(root, ['rev-parse', '--show-prefix']).toString('utf8').trim();
  const shaPaths = new Map(); // sha -> set of root-relative paths
  const seenPaths = new Set();
  const add = (sha, p) => {
    if (prefix) {
      if (!p.startsWith(prefix)) return;
      p = p.slice(prefix.length);
    }
    if (!shaPaths.has(sha)) shaPaths.set(sha, new Set());
    shaPaths.get(sha).add(p);
    seenPaths.add(p);
  };
  // Every (blob, path) pair that any commit ever introduced; rev-list lists a blob under one path only.
  const raw = git(root, ['log', '--all', '--format=', '--raw', '--no-abbrev', '--no-renames', '-r', '-z']).toString('utf8').split('\0');
  for (let i = 0; i < raw.length; i++) {
    const meta = /^:\d+ \d+ [0-9a-f]+ ([0-9a-f]+) (\w)$/.exec(raw[i].trim());
    if (!meta) continue;
    const p = raw[++i];
    if (meta[2] !== 'D' && p) add(meta[1], p);
  }
  const known = new Set(shaPaths.keys());
  for (const entry of git(root, ['rev-list', '--objects', '--all']).toString('utf8').split('\n')) {
    const sp = entry.indexOf(' ');
    if (sp > 0 && !known.has(entry.slice(0, sp))) add(entry.slice(0, sp), entry.slice(sp + 1));
  }
  for (const p of seenPaths) {
    if (!SKIP_PATHS.includes(p)) scanName(p, folderOf(p), acc);
  }
  // Keep only blobs, and only those with at least one path that is not skipped.
  const shas = [...shaPaths.keys()];
  if (shas.length) {
    const kinds = git(root, ['cat-file', '--batch-check=%(objectname) %(objecttype)'], { input: shas.join('\n') + '\n' })
      .toString('utf8')
      .split('\n');
    const blobs = kinds.filter((l) => l.endsWith(' blob')).map((l) => l.split(' ')[0]);
    const wanted = blobs.filter((sha) => [...shaPaths.get(sha)].some((p) => !SKIP_PATHS.includes(p) && !isBinaryPath(p)));
    if (wanted.length) {
      const out = git(root, ['cat-file', '--batch'], { input: wanted.join('\n') + '\n' });
      let pos = 0;
      while (pos < out.length) {
        const nl = out.indexOf(0x0a, pos);
        const [sha, , size] = out.toString('utf8', pos, nl).split(' ');
        const len = Number(size);
        const body = out.subarray(nl + 1, nl + 1 + len);
        pos = nl + 1 + len + 1;
        if (isBinaryBuffer(body)) continue;
        const p = [...shaPaths.get(sha)].find((x) => !SKIP_PATHS.includes(x)) ?? '';
        scanLines(p, folderOf(p), body.toString('utf8').split(/\r?\n/), acc, opts);
      }
    }
  }
  const log = git(root, ['log', '--all', '--format=%B%x00']).toString('utf8').split('\0');
  for (const msg of log) scanLines('(commit message)', '(commit message)', msg.split(/\r?\n/), acc, opts);
}

// ---- reporting -------------------------------------------------------------------------------------------------

function summarize(acc) {
  const folders = new Map();
  const slot = (f) => {
    if (!folders.has(f)) folders.set(f, { vietnamese: 0, coupling: 0, commentLines: 0 });
    return folders.get(f);
  };
  const seen = new Set(); // one hit per (class, path, line)
  for (const h of acc.hits) {
    const key = `${h.coupling ? 'c' : 'v'}|${h.path}|${h.line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    slot(h.folder)[h.coupling ? 'coupling' : 'vietnamese']++;
  }
  for (const [f, n] of acc.commentLines) slot(f).commentLines = n;
  const total = { vietnamese: 0, coupling: 0, commentLines: 0 };
  for (const v of folders.values()) {
    total.vietnamese += v.vietnamese;
    total.coupling += v.coupling;
    total.commentLines += v.commentLines;
  }
  return { folders, total };
}

const HELP = `lang-scan: language and coupling scanner
  --tree (default)    tracked files of the working tree, contents and names
  --path <dir|file>   only tracked files under that path
  --names             path names only (together with --tree: contents and names)
  --staged            added lines of the staged diff and staged path names (pre-commit)
  --message <file>    one commit message (commit-msg)
  --history           every blob, path and commit message reachable from any ref
  --pr-event <file>   a GitHub pull_request event: title, body, head branch
  --coupling          also count coupling to the source repo
  --list              print every hit as path:line
  --check-baseline    exit 1 if any folder is above scripts/lang-baseline.json
  --write-baseline    rewrite scripts/lang-baseline.json from a tree scan with coupling
  --max <n>           exit 1 when the count is above n
  --root <dir>        scan another package root (default: the folder that contains scripts/)
Exit code: 0 when the count is 0 or within the limit; hook and CI modes exit 1 otherwise.`;

function parseArgs(argv) {
  const o = { modes: new Set(), coupling: false, list: false, checkBaseline: false, writeBaseline: false, max: null, root: null, path: null, message: null, prEvent: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`missing value for ${a}`);
      return v;
    };
    if (a === '--tree') o.modes.add('tree');
    else if (a === '--names') o.modes.add('names');
    else if (a === '--staged') o.modes.add('staged');
    else if (a === '--history') o.modes.add('history');
    else if (a === '--path') {
      o.modes.add('path');
      o.path = val();
    } else if (a === '--message') {
      o.modes.add('message');
      o.message = val();
    } else if (a === '--pr-event') {
      o.modes.add('pr-event');
      o.prEvent = val();
    } else if (a === '--coupling') o.coupling = true;
    else if (a === '--list') o.list = true;
    else if (a === '--check-baseline') o.checkBaseline = true;
    else if (a === '--write-baseline') o.writeBaseline = true;
    else if (a === '--max') o.max = Number(val());
    else if (a === '--root') o.root = val();
    else if (a === '--help' || a === '-h') o.help = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  return o;
}

function baselinePath(root) {
  return path.join(root, 'scripts', 'lang-baseline.json');
}

/** Runs the scanner. Returns { code, lines } and prints nothing. */
export function run(argv, { root: rootOverride } = {}) {
  const lines = [];
  let o;
  try {
    o = parseArgs(argv);
  } catch (e) {
    return { code: 2, lines: [String(e.message)] };
  }
  if (o.help) return { code: 0, lines: HELP.split('\n') };
  const root = path.resolve(o.root ?? rootOverride ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
  const opts = { coupling: o.coupling || o.checkBaseline || o.writeBaseline, localPatterns: loadLocalPatterns(root) };
  const acc = { hits: [], commentLines: new Map() };
  const modes = o.modes;
  let hookMode = false;
  try {
    if (modes.has('staged')) {
      scanStaged(root, acc, opts);
      hookMode = true;
    }
    if (modes.has('message')) {
      scanMessage(path.resolve(o.message), acc, opts);
      hookMode = true;
    }
    if (modes.has('pr-event')) {
      scanPrEvent(path.resolve(o.prEvent), acc, opts);
      hookMode = true;
    }
    if (modes.has('history')) {
      scanHistory(root, acc, opts);
      hookMode = true;
    }
    const treeLike = modes.has('tree') || modes.has('path') || modes.has('names') || o.checkBaseline || o.writeBaseline || modes.size === 0;
    if (treeLike) {
      const namesOnly = modes.has('names') && !modes.has('tree') && !modes.has('path');
      const prefix = modes.has('path') ? toPosix(path.normalize(o.path)).replace(/\/$/, '') : '';
      scanTree(root, acc, opts, { content: !namesOnly, prefix });
    }
  } catch (e) {
    return { code: 2, lines: [`lang-scan failed: ${e.message}`] };
  }
  const { folders, total } = summarize(acc);
  const count = total.vietnamese + (o.coupling ? total.coupling : 0);
  lines.push(`vietnamese: ${total.vietnamese}`);
  if (opts.coupling) lines.push(`coupling: ${total.coupling}`);
  lines.push(`comment-lines: ${total.commentLines}`);
  lines.push('per folder:');
  for (const f of [...folders.keys()].sort()) {
    const s = folders.get(f);
    lines.push(`  ${f}: vietnamese ${s.vietnamese}, coupling ${s.coupling}, comment-lines ${s.commentLines}`);
  }
  if (o.list || hookMode) {
    const seen = new Set();
    for (const h of acc.hits) {
      const key = `${h.coupling ? 'c' : 'v'}|${h.path}|${h.line}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const tag = h.coupling ? `coupling/${h.kind}` : `${h.cls}/${h.kind}`;
      const extra = hookMode && h.text ? `  ${h.text.trim().slice(0, 160)}` : '';
      lines.push(`${h.path}:${h.line}  [${tag}] ${h.match}${extra}`);
    }
  }
  if (o.writeBaseline) {
    const base = { vietnamese: {}, coupling: {} };
    for (const f of [...folders.keys()].sort()) {
      if (folders.get(f).vietnamese) base.vietnamese[f] = folders.get(f).vietnamese;
      if (folders.get(f).coupling) base.coupling[f] = folders.get(f).coupling;
    }
    fs.writeFileSync(baselinePath(root), JSON.stringify(base, null, 2) + '\n');
    lines.push(`baseline written: ${toPosix(path.relative(root, baselinePath(root)))}`);
    return { code: 0, lines };
  }
  if (o.checkBaseline) {
    const file = baselinePath(root);
    const base = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { vietnamese: {}, coupling: {} };
    let bad = 0;
    for (const [f, s] of folders) {
      for (const cls of ['vietnamese', 'coupling']) {
        const allowed = base[cls]?.[f] ?? 0;
        if (s[cls] > allowed) {
          lines.push(`ABOVE BASELINE: ${f} ${cls} ${s[cls]} > ${allowed}`);
          bad++;
        }
      }
    }
    lines.push(bad ? 'baseline check: FAILED' : 'baseline check: ok');
    return { code: bad ? 1 : 0, lines };
  }
  const limit = o.max ?? 0;
  const failMode = hookMode || o.max !== null;
  return { code: failMode && count > limit ? 1 : 0, lines };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const { code, lines } = run(process.argv.slice(2));
  console.log(lines.join('\n'));
  process.exit(code);
}
