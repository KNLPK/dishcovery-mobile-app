# Image credits

The recipes in the online catalog were written by an AI model and have no
photos. So that the app does not look empty, it shows one of 28 food photos
instead (`constants/illustrativePhotos.ts`). Words in the recipe title pick the
kind of dish (14 kinds, two photos each), and the recipe id picks one of that
kind's two photos, so the same recipe always shows the same photo and
neighbouring recipes of the same kind mostly show different ones. The photos
only illustrate the kind of dish, and recipe pages label them **Illustrative
photo**.

The photos are part of the app only. The recipe payloads, the fixtures and
every byte that was measured are unchanged: a generated recipe's `image` field
is still its `generated://` reference.

All 28 are from [Unsplash](https://unsplash.com) under the
[Unsplash License](https://unsplash.com/license), which allows free use,
including in apps, without asking for permission. Credit is not required, but
it is given here. Each licence was checked on the photo's own page: the `-1`
files on 22 October 2026, the `-2` files and both `noodles` and `curry` files
on 23 October 2026. None is an Unsplash+ photo. The files were made with
Unsplash's own image service: cropped to 640 × 400, WebP, each under 60 KB.

| File (`assets/images/food/`) | Shown for | Photo | Photographer |
| --- | --- | --- | --- |
| `dessert-1.webp` | desserts | [P_l1bJQpQF0](https://unsplash.com/photos/P_l1bJQpQF0) | [Will Echols](https://unsplash.com/@willecholz) |
| `dessert-2.webp` | desserts | [kpZQjdTOkqE](https://unsplash.com/photos/kpZQjdTOkqE) | [Shoeib Abolhassani](https://unsplash.com/@shoeibabhn) |
| `noodles-1.webp` | noodles, ramen, udon, soba | [rAyCBQTH7ws](https://unsplash.com/photos/rAyCBQTH7ws) | [Michele Blackwell](https://unsplash.com/@mab_studio) |
| `noodles-2.webp` | noodles, ramen, udon, soba | [3dGngNs0kpY](https://unsplash.com/photos/3dGngNs0kpY) | [Zoshua Colah](https://unsplash.com/@zoshuacolah) |
| `chicken-1.webp` | chicken, duck, turkey | [BhnZwPW_tIc](https://unsplash.com/photos/BhnZwPW_tIc) | [Anshu A](https://unsplash.com/@anshu18) |
| `chicken-2.webp` | chicken, duck, turkey | [hV4_DinnR_0](https://unsplash.com/photos/hV4_DinnR_0) | [Annie Spratt](https://unsplash.com/@anniespratt) |
| `beef-1.webp` | beef, lamb, other red meat | [62XLglIrTJc](https://unsplash.com/photos/62XLglIrTJc) | [Justus Menke](https://unsplash.com/@justusmenke) |
| `beef-2.webp` | beef, lamb, other red meat | [qKPKDb4_W24](https://unsplash.com/photos/qKPKDb4_W24) | [Davis Dai](https://unsplash.com/@lingo4208) |
| `pork-1.webp` | pork, bacon, sausage | [CRoAeTh5S_I](https://unsplash.com/photos/CRoAeTh5S_I) | [Sebastian Coman Photography](https://unsplash.com/@sebastiancoman) |
| `pork-2.webp` | pork, bacon, sausage | [ypLK2aLvF1Q](https://unsplash.com/photos/ypLK2aLvF1Q) | [Zion C](https://unsplash.com/@jcs_chen) |
| `fish-1.webp` | fish and seafood | [KRbF_wsztBE](https://unsplash.com/photos/KRbF_wsztBE) | [Keesha's Kitchen](https://unsplash.com/@keeshasskitchen) |
| `fish-2.webp` | fish and seafood | [FiypVqvsweQ](https://unsplash.com/photos/FiypVqvsweQ) | [Lee Milo](https://unsplash.com/@miloleetw) |
| `egg-1.webp` | egg dishes | [uAm1CZMdPCw](https://unsplash.com/photos/uAm1CZMdPCw) | [Eiliv Aceron](https://unsplash.com/@shootdelicious) |
| `egg-2.webp` | egg dishes | [aDccXHMCH2c](https://unsplash.com/photos/aDccXHMCH2c) | [Alex Bayev](https://unsplash.com/@alexbayev) |
| `pasta-1.webp` | pasta, couscous, dumplings | [flFd8L7_B3g](https://unsplash.com/photos/flFd8L7_B3g) | [Ben Lei](https://unsplash.com/@bleiplays33) |
| `pasta-2.webp` | pasta, couscous, dumplings | [uFHgoz2lnZQ](https://unsplash.com/photos/uFHgoz2lnZQ) | [Aurora Song](https://unsplash.com/@auroras13) |
| `rice-1.webp` | rice dishes | [zXNC_lBBVGE](https://unsplash.com/photos/zXNC_lBBVGE) | [Vinn Koonyosying](https://unsplash.com/@mggbox) |
| `rice-2.webp` | rice dishes | [oT7_v-I0hHg](https://unsplash.com/photos/oT7_v-I0hHg) | [Annie Spratt](https://unsplash.com/@anniespratt) |
| `curry-1.webp` | curries, dal | [tsQhEvzU6MQ](https://unsplash.com/photos/tsQhEvzU6MQ) | [Rimsha Noor](https://unsplash.com/@rimshaj123) |
| `curry-2.webp` | curries, dal | [sqcH2q7lkvo](https://unsplash.com/photos/sqcH2q7lkvo) | [Raman](https://unsplash.com/@potofgold07) |
| `soup-1.webp` | soups, stews | [w6ftFbPCs9I](https://unsplash.com/photos/w6ftFbPCs9I) | [Cala](https://unsplash.com/@calajay) |
| `soup-2.webp` | soups, stews | [sIKxa702NbA](https://unsplash.com/photos/sIKxa702NbA) | [Elena Leya](https://unsplash.com/@foodistika) |
| `salad-1.webp` | salads, vegetables, grains, tofu, stir-fries | [0IgN3TbE4rM](https://unsplash.com/photos/0IgN3TbE4rM) | [Christine Isakzhanova](https://unsplash.com/@bulochka) |
| `salad-2.webp` | salads, vegetables, grains, tofu, stir-fries | [BE0-pX6-J04](https://unsplash.com/photos/BE0-pX6-J04) | [Kuali Nenek](https://unsplash.com/@kualinenekjkt) |
| `breakfast-1.webp` | bread, flatbread, pancakes | [qp7WA8AV2x0](https://unsplash.com/photos/qp7WA8AV2x0) | [nikldn](https://unsplash.com/@nikldn) |
| `breakfast-2.webp` | bread, flatbread, pancakes | [B1AHcNg8BTU](https://unsplash.com/photos/B1AHcNg8BTU) | [Raychan](https://unsplash.com/@wx1993) |
| `fallback-1.webp` | anything else | [EzH46XCDQRY](https://unsplash.com/photos/EzH46XCDQRY) | [Maarten van den Heuvel](https://unsplash.com/@mvdheuvel) |
| `fallback-2.webp` | anything else | [Q_Moi2xjieU](https://unsplash.com/photos/Q_Moi2xjieU) | [Stefan Vladimirov](https://unsplash.com/@skv_creates) |
