# 暮光遊樂館：第三方美術資產與授權

這個資料夾底下的 GLB 都是免費、可商用的 CC0（公眾領域）素材。CC0 不要求署名，我們仍然列出來源，
方便之後查證或換版本。

| 資料夾                                                                                                                        | 內容                                                                | 作者／套件                                                                                                                                                                         | 授權                                                          | 取得方式                                                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `models/characters/mini_*.glb`                                                                                                | 玩家與 NPC 角色（12 個造型，含 idle／walk／sprint／sit 等骨架動畫） | Kenney — [Mini Characters 1.0](https://kenney.nl/assets/mini-characters)                                                                                                           | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | npm 套件 [`@netforge/asset-library-files@0.2.0`](https://www.npmjs.com/package/@netforge/asset-library-files) 的 `library/lowpoly/`（meshopt 最佳化版，套件 NOTICE 載明原始授權為 CC0） |
| `models/district/building_*.glb`、`skyscraper_*.glb`、`sedan`／`taxi`／`van`／`suv`、`tree_*`、`bush*`、`flower_red`、`fence` | 街區大樓、汽車、行道樹、灌木、圍籬                                  | Kenney — [City Kit (Commercial) 2.1](https://kenney.nl/assets/city-kit-commercial)、[Car Kit](https://kenney.nl/assets/car-kit)、[Nature Kit](https://kenney.nl/assets/nature-kit) | CC0 1.0                                                       | 同上（`@netforge/asset-library-files@0.2.0`）                                                                                                                                           |
| `models/kenney-city/*.glb`、`Textures/colormap.png`                                                                           | 彩色小店屋、車庫、噴水池、樹叢地塊                                  | Kenney — [Starter Kit City Builder](https://github.com/KenneyNL/Starter-Kit-City-Builder)（README：「3D Models (CC0 licensed)」）                                                  | CC0 1.0                                                       | 直接取自該 GitHub repo 的 `models/`                                                                                                                                                     |

## 程式裡怎麼用

- 角色：`src/components/club/Avatar.tsx`。每位玩家依顏色挑一個造型，再用 shader 把衣服換成自己的色相（膚色、黑白灰不變）。
- 街區：`src/components/club/district.ts`（擺放資料、碰撞、鏡頭遮擋）與 `District.tsx`（InstancedMesh 繪製、夜晚窗燈）。

## 換模型或加新模型

1. GLB 放進對應資料夾（1 單位 = 1 公尺或在 `district.ts` 用 `s` 縮放；Y 向上、正面朝 +Z、原點在底面中心）。
2. 在 `DISTRICT_MODELS` 登記網址與包圍盒，在 `DISTRICT` 加擺放。碰撞與尋路會自動更新。
3. 在這份表格補上來源與授權。只收 CC0／CC-BY 這類允許再散布的素材；CC-BY 要在這裡署名。
