// Auto-generated from buildings.json. Do not edit by hand.
import type { BuildingDefinition } from '@rugged/game';

export const buildings: BuildingDefinition[] = [
  {
    "id": "storehouse",
    "name": "Storehouse",
    "description": "A storage building for resources",
    "category": "storage",
    "icon": "\ud83d\udce6",
    "sprite": {
      "foundation": "building_foundation",
      "completed": "storehouse"
    },
    "footprint": {
      "width": 3,
      "height": 3
    },
    "constructionTime": 15,
    "costs": [
      {
        "itemType": "logs",
        "quantity": 1
      },
      {
        "itemType": "stone",
        "quantity": 2
      }
    ],
    "isWarehouse": true,
    "workerSlots": 2,
    "requiredProfession": "carrier",
    "storagePreservation": {
      "spoilageMultiplier": 1
    },
    "storageSlots": [
      {
        "itemType": "logs",
        "offset": {
          "x": 3,
          "y": 0
        }
      },
      {
        "itemType": "logs",
        "offset": {
          "x": 3,
          "y": 1
        }
      },
      {
        "itemType": "stone",
        "offset": {
          "x": 4,
          "y": 0
        }
      },
      {
        "itemType": "stone",
        "offset": {
          "x": 4,
          "y": 1
        }
      },
      {
        "itemType": "planks",
        "offset": {
          "x": 3,
          "y": 2
        }
      },
      {
        "itemType": "planks",
        "offset": {
          "x": 4,
          "y": 2
        }
      }
    ]
  },
  {
    "id": "granary",
    "name": "Granary",
    "description": "Stores wheat and grain",
    "category": "storage",
    "icon": "\ud83c\udf3e",
    "sprite": {
      "foundation": "building_foundation",
      "completed": "storehouse"
    },
    "footprint": {
      "width": 3,
      "height": 3
    },
    "constructionTime": 18,
    "costs": [
      {
        "itemType": "logs",
        "quantity": 2
      },
      {
        "itemType": "stone",
        "quantity": 1
      },
      {
        "itemType": "planks",
        "quantity": 1
      }
    ],
    "isWarehouse": true,
    "workerSlots": 1,
    "storagePreservation": {
      "spoilageMultiplier": 0.4
    },
    "storageSlots": [
      {
        "itemType": "wheat",
        "offset": {
          "x": 3,
          "y": 0
        }
      },
      {
        "itemType": "wheat",
        "offset": {
          "x": 3,
          "y": 1
        }
      },
      {
        "itemType": "grain",
        "offset": {
          "x": 4,
          "y": 0
        }
      },
      {
        "itemType": "grain",
        "offset": {
          "x": 4,
          "y": 1
        }
      }
    ]
  },
  {
    "id": "vault",
    "name": "Vault",
    "description": "Securely stores gold bars and coins",
    "category": "storage",
    "icon": "\ud83d\udd10",
    "sprite": {
      "foundation": "building_foundation",
      "completed": "storehouse"
    },
    "footprint": {
      "width": 2,
      "height": 2
    },
    "constructionTime": 18,
    "costs": [
      {
        "itemType": "stone",
        "quantity": 3
      },
      {
        "itemType": "planks",
        "quantity": 1
      }
    ],
    "isWarehouse": true,
    "workerSlots": 1,
    "requiredProfession": "carrier",
    "storagePreservation": {
      "spoilageMultiplier": 1
    },
    "storageSlots": [
      {
        "itemType": "gold_bar",
        "offset": {
          "x": 2,
          "y": 0
        }
      },
      {
        "itemType": "gold_coin",
        "offset": {
          "x": 2,
          "y": 1
        }
      }
    ]
  },
  {
    "id": "food_cellar",
    "name": "Food Cellar",
    "description": "Stores preserved food",
    "category": "storage",
    "icon": "\ud83e\udd55",
    "sprite": {
      "foundation": "building_foundation",
      "completed": "storehouse"
    },
    "footprint": {
      "width": 3,
      "height": 3
    },
    "constructionTime": 18,
    "costs": [
      {
        "itemType": "logs",
        "quantity": 2
      },
      {
        "itemType": "stone",
        "quantity": 2
      },
      {
        "itemType": "planks",
        "quantity": 1
      }
    ],
    "isWarehouse": true,
    "workerSlots": 1,
    "storagePreservation": {
      "spoilageMultiplier": 0.2
    },
    "storageSlots": [
      {
        "itemType": "bread",
        "offset": {
          "x": 3,
          "y": 0
        }
      },
      {
        "itemType": "bread",
        "offset": {
          "x": 3,
          "y": 1
        }
      },
      {
        "itemType": "carrot",
        "offset": {
          "x": 4,
          "y": 0
        }
      }
    ]
  },
  {
    "id": "house",
    "name": "House",
    "description": "A simple house that spawns settlers",
    "category": "civil",
    "icon": "\ud83c\udfe0",
    "sprite": {
      "foundation": "building_foundation",
      "completed": "house"
    },
    "footprint": {
      "width": 2,
      "height": 2
    },
    "constructionTime": 20,
    "costs": [
      {
        "itemType": "logs",
        "quantity": 2
      },
      {
        "itemType": "stone",
        "quantity": 1
      }
    ],
    "render": {
      "modelSrc": "/assets/library/cottage.glb"
    },
    "spawnsSettlers": true,
    "maxOccupants": 5,
    "spawnRate": 30,
    "storageSlots": [
      {
        "itemType": "bread",
        "offset": {
          "x": 1,
          "y": 1
        },
        "hidden": true,
        "maxQuantity": 3
      },
      {
        "itemType": "carrot",
        "offset": {
          "x": 1,
          "y": 0
        },
        "hidden": true,
        "maxQuantity": 3
      }
    ],
    "entryPoint": {
      "x": 0.9,
      "y": 1.3
    },
    "centerPoint": {
      "x": 1,
      "y": 1
    }
  },
  {
    "id": "graveyard",
    "name": "Graveyard",
    "description": "A fenced field for honoring the fallen",
    "category": "civil",
    "icon": "\ud83e\udea6",
    "sprite": {
      "foundation": "building_foundation",
      "completed": "storehouse"
    },
    "footprint": {
      "width": 5,
      "height": 5
    },
    "constructionTime": 12,
    "costs": [
      {
        "itemType": "logs",
        "quantity": 2
      },
      {
        "itemType": "stone",
        "quantity": 2
      }
    ],
    "consumes": [
      {
        "itemType": "tombstone",
        "desiredQuantity": 9
      }
    ],
    "storageSlots": [
      {
        "itemType": "tombstone",
        "offset": {
          "x": 1,
          "y": 1
        },
        "maxQuantity": 1
      },
      {
        "itemType": "tombstone",
        "offset": {
          "x": 2,
          "y": 1
        },
        "maxQuantity": 1
      },
      {
        "itemType": "tombstone",
        "offset": {
          "x": 3,
          "y": 1
        },
        "maxQuantity": 1
      },
      {
        "itemType": "tombstone",
        "offset": {
          "x": 1,
          "y": 2
        },
        "maxQuantity": 1
      },
      {
        "itemType": "tombstone",
        "offset": {
          "x": 2,
          "y": 2
        },
        "maxQuantity": 1
      },
      {
        "itemType": "tombstone",
        "offset": {
          "x": 3,
          "y": 2
        },
        "maxQuantity": 1
      },
      {
        "itemType": "tombstone",
        "offset": {
          "x": 1,
          "y": 3
        },
        "maxQuantity": 1
      },
      {
        "itemType": "tombstone",
        "offset": {
          "x": 2,
          "y": 3
        },
        "maxQuantity": 1
      },
      {
        "itemType": "tombstone",
        "offset": {
          "x": 3,
          "y": 3
        },
        "maxQuantity": 1
      }
    ]
  },
  {
    "id": "woodcutter_hut",
    "name": "Woodcutter Hut",
    "description": "A simple hut where woodcutters gather logs",
    "category": "industry",
    "icon": "\ud83e\udeb5",
    "sprite": {
      "foundation": "building_foundation",
      "completed": "woodcutter_hut"
    },
    "footprint": {
      "width": 2,
      "height": 2
    },
    "constructionTime": 10,
    "costs": [
      {
        "itemType": "logs",
        "quantity": 1
      }
    ],
    "harvest": {
      "nodeType": "tree",
      "radiusTiles": 8
    },
    "requiredProfession": "woodcutter",
    "workerSlots": 1,
    "storageSlots": [
      {
        "itemType": "logs",
        "offset": {
          "x": 2,
          "y": 0
        }
      }
    ]
  },
  {
    "id": "forester_hut",
    "name": "Forester Hut",
    "description": "Plants new trees to sustain nearby forests",
    "category": "industry",
    "icon": "\ud83c\udf32",
    "sprite": {
      "foundation": "building_foundation",
      "completed": "woodcutter_hut"
    },
    "footprint": {
      "width": 2,
      "height": 2
    },
    "constructionTime": 12,
    "costs": [
      {
        "itemType": "logs",
        "quantity": 1
      }
    ],
    "requiredProfession": "woodcutter",
    "workerSlots": 1,
    "farm": {
      "cropNodeType": "tree",
      "plotRadiusTiles": 8,
      "plantTimeMs": 2000,
      "growTimeMs": 45000,
      "maxPlots": 18,
      "allowHarvest": false,
      "minSpacingTiles": 1,
      "postPlantReturnWaitMs": 2000
    }
  },
  {
    "id": "quarry",
    "name": "Quarry",
    "description": "Extracts stone from deposits",
    "category": "industry",
    "icon": "\u26cf\ufe0f",
    "sprite": {
      "foundation": "building_foundation",
      "completed": "woodcutter_hut"
    },
    "footprint": {
      "width": 2,
      "height": 2
    },
    "constructionTime": 12,
    "costs": [
      {
        "itemType": "logs",
        "quantity": 1
      },
      {
        "itemType": "stone",
        "quantity": 1
      }
    ],
    "harvest": {
      "nodeType": "stone_deposit",
      "radiusTiles": 8
    },
    "requiredProfession": "miner",
    "workerSlots": 1,
    "storageSlots": [
      {
        "itemType": "stone",
        "offset": {
          "x": 2,
          "y": 0
        }
      }
    ]
  },
  {
    "id": "coal_mine",
    "name": "Coal Mine",
    "description": "Extracts coal from mountain seams",
    "category": "metalwork",
    "icon": "\u26cf\ufe0f",
    "sprite": {
      "foundation": "building_foundation",
      "completed": "woodcutter_hut"
    },
    "footprint": {
      "width": 2,
      "height": 2
    },
    "constructionTime": 14,
    "costs": [
      {
        "itemType": "logs",
        "quantity": 1
      },
      {
        "itemType": "stone",
        "quantity": 1
      }
    ],
    "requiredProfession": "miner",
    "workerSlots": 1,
    "allowedGroundTypes": [
      "mountain"
    ],
    "productionRecipe": {
      "inputs": [],
      "outputs": [
        {
          "itemType": "coal",
          "quantity": 1
        }
      ],
      "productionTime": 10
    },
    "storageSlots": [
      {
        "itemType": "coal",
        "offset": {
          "x": 2,
          "y": 0
        }
      }
    ]
  },
  {
    "id": "iron_mine",
    "name": "Iron Mine",
    "description": "Extracts iron ore from mountain veins",
    "category": "metalwork",
    "icon": "\u26cf\ufe0f",
    "sprite": {
      "foundation": "building_foundation",
      "completed": "woodcutter_hut"
    },
    "footprint": {
      "width": 2,
      "height": 2
    },
    "constructionTime": 15,
    "costs": [
      {
        "itemType": "logs",
        "quantity": 1
      },
      {
        "itemType": "stone",
        "quantity": 1
      }
    ],
    "requiredProfession": "miner",
    "workerSlots": 1,
    "allowedGroundTypes": [
      "mountain"
    ],
    "productionRecipe": {
      "inputs": [],
      "outputs": [
        {
          "itemType": "iron_ore",
          "quantity": 1
        }
      ],
      "productionTime": 12
    },
    "storageSlots": [
      {
        "itemType": "iron_ore",
        "offset": {
          "x": 2,
          "y": 0
        }
      }
    ]
  },
  {
    "id": "gold_mine",
    "name": "Gold Mine",
    "description": "Extracts gold ore from mountain seams",
    "category": "metalwork",
    "icon": "\u26cf\ufe0f",
    "sprite": {
      "foundation": "building_foundation",
      "completed": "woodcutter_hut"
    },
    "footprint": {
      "width": 2,
      "height": 2
    },
    "constructionTime": 16,
    "costs": [
      {
        "itemType": "logs",
        "quantity": 1
      },
      {
        "itemType": "stone",
        "quantity": 1
      }
    ],
    "requiredProfession": "miner",
    "workerSlots": 1,
    "allowedGroundTypes": [
      "mountain"
    ],
    "productionRecipe": {
      "inputs": [],
      "outputs": [
        {
          "itemType": "gold_ore",
          "quantity": 1
        }
      ],
      "productionTime": 14
    },
    "storageSlots": [
      {
        "itemType": "gold_ore",
        "offset": {
          "x": 2,
          "y": 0
        }
      }
    ]
  },
  {
    "id": "sawmill",
    "name": "Sawmill",
    "description": "Converts logs into planks",
    "category": "industry",
    "icon": "\ud83c\udfed",
    "sprite": {
      "foundation": "building_foundation",
      "completed": "sawmill"
    },
    "footprint": {
      "width": 3,
      "height": 3
    },
    "constructionTime": 20,
    "costs": [
      {
        "itemType": "logs",
        "quantity": 2
      },
      {
        "itemType": "stone",
        "quantity": 2
      }
    ],
    "requiredProfession": "woodcutter",
    "workerSlots": 1,
    "productionRecipe": {
      "inputs": [
        {
          "itemType": "logs",
          "quantity": 2
        }
      ],
      "outputs": [
        {
          "itemType": "planks",
          "quantity": 1
        }
      ],
      "productionTime": 10
    },
    "storageSlots": [
      {
        "itemType": "logs",
        "offset": {
          "x": 3,
          "y": 0
        }
      },
      {
        "itemType": "planks",
        "offset": {
          "x": 3,
          "y": 1
        }
      }
    ]
  },
  {
    "id": "iron_smelter",
    "name": "Iron Smelter",
    "description": "Smelts iron ore into iron bars",
    "category": "metalwork",
    "icon": "\ud83d\udd25",
    "sprite": {
      "foundation": "building_foundation",
      "completed": "sawmill"
    },
    "footprint": {
      "width": 3,
      "height": 3
    },
    "constructionTime": 20,
    "costs": [
      {
        "itemType": "logs",
        "quantity": 2
      },
      {
        "itemType": "stone",
        "quantity": 2
      }
    ],
    "requiredProfession": "metallurgist",
    "workerSlots": 1,
    "productionRecipe": {
      "inputs": [
        {
          "itemType": "iron_ore",
          "quantity": 1
        },
        {
          "itemType": "coal",
          "quantity": 1
        }
      ],
      "outputs": [
        {
          "itemType": "iron_bar",
          "quantity": 1
        }
      ],
      "productionTime": 12
    },
    "storageSlots": [
      {
        "itemType": "iron_ore",
        "offset": {
          "x": 3,
          "y": 0
        }
      },
      {
        "itemType": "coal",
        "offset": {
          "x": 3,
          "y": 1
        }
      },
      {
        "itemType": "iron_bar",
        "offset": {
          "x": 3,
          "y": 2
        }
      }
    ]
  },
  {
    "id": "gold_smelter",
    "name": "Gold Smelter",
    "description": "Smelts gold ore into gold bars",
    "category": "metalwork",
    "icon": "\ud83d\udd25",
    "sprite": {
      "foundation": "building_foundation",
      "completed": "sawmill"
    },
    "footprint": {
      "width": 3,
      "height": 3
    },
    "constructionTime": 22,
    "costs": [
      {
        "itemType": "logs",
        "quantity": 2
      },
      {
        "itemType": "stone",
        "quantity": 2
      }
    ],
    "requiredProfession": "metallurgist",
    "workerSlots": 1,
    "productionRecipe": {
      "inputs": [
        {
          "itemType": "gold_ore",
          "quantity": 1
        },
        {
          "itemType": "coal",
          "quantity": 1
        }
      ],
      "outputs": [
        {
          "itemType": "gold_bar",
          "quantity": 1
        }
      ],
      "productionTime": 14
    },
    "storageSlots": [
      {
        "itemType": "gold_ore",
        "offset": {
          "x": 3,
          "y": 0
        }
      },
      {
        "itemType": "coal",
        "offset": {
          "x": 3,
          "y": 1
        }
      },
      {
        "itemType": "gold_bar",
        "offset": {
          "x": 3,
          "y": 2
        }
      }
    ]
  },
  {
    "id": "mint",
    "name": "Mint",
    "description": "Mints gold bars into gold coins",
    "category": "metalwork",
    "icon": "\ud83e\ude99",
    "sprite": {
      "foundation": "building_foundation",
      "completed": "sawmill"
    },
    "footprint": {
      "width": 3,
      "height": 3
    },
    "constructionTime": 20,
    "costs": [
      {
        "itemType": "logs",
        "quantity": 2
      },
      {
        "itemType": "stone",
        "quantity": 2
      }
    ],
    "requiredProfession": "metallurgist",
    "workerSlots": 1,
    "productionRecipe": {
      "inputs": [
        {
          "itemType": "gold_bar",
          "quantity": 1
        }
      ],
      "outputs": [
        {
          "itemType": "gold_coin",
          "quantity": 10
        }
      ],
      "productionTime": 8
    },
    "storageSlots": [
      {
        "itemType": "gold_bar",
        "offset": {
          "x": 3,
          "y": 0
        }
      },
      {
        "itemType": "gold_coin",
        "offset": {
          "x": 3,
          "y": 1
        }
      }
    ]
  },
  {
    "id": "armory",
    "name": "Armory",
    "description": "Forges weapons and helmets",
    "category": "metalwork",
    "icon": "\ud83d\udee1\ufe0f",
    "sprite": {
      "foundation": "building_foundation",
      "completed": "sawmill"
    },
    "footprint": {
      "width": 3,
      "height": 3
    },
    "constructionTime": 22,
    "costs": [
      {
        "itemType": "logs",
        "quantity": 2
      },
      {
        "itemType": "stone",
        "quantity": 2
      },
      {
        "itemType": "planks",
        "quantity": 1
      }
    ],
    "requiredProfession": "metallurgist",
    "workerSlots": 1,
    "productionRecipes": [
      {
        "id": "spear",
        "inputs": [
          {
            "itemType": "iron_bar",
            "quantity": 1
          },
          {
            "itemType": "logs",
            "quantity": 1
          }
        ],
        "outputs": [
          {
            "itemType": "spear",
            "quantity": 1
          }
        ],
        "productionTime": 16
      },
      {
        "id": "crossbow",
        "inputs": [
          {
            "itemType": "iron_bar",
            "quantity": 2
          },
          {
            "itemType": "logs",
            "quantity": 1
          }
        ],
        "outputs": [
          {
            "itemType": "crossbow",
            "quantity": 1
          }
        ],
        "productionTime": 16
      },
      {
        "id": "helmet",
        "inputs": [
          {
            "itemType": "iron_bar",
            "quantity": 2
          },
          {
            "itemType": "logs",
            "quantity": 1
          }
        ],
        "outputs": [
          {
            "itemType": "helmet",
            "quantity": 1
          }
        ],
        "productionTime": 16
      }
    ],
    "productionPlanDefaults": {
      "spear": 1,
      "crossbow": 1,
      "helmet": 1
    },
    "storageSlots": [
      {
        "itemType": "iron_bar",
        "offset": {
          "x": 3,
          "y": 0
        }
      },
      {
        "itemType": "logs",
        "offset": {
          "x": 3,
          "y": 1
        }
      },
      {
        "itemType": "spear",
        "offset": {
          "x": 4,
          "y": 0
        }
      },
      {
        "itemType": "crossbow",
        "offset": {
          "x": 4,
          "y": 1
        }
      },
      {
        "itemType": "helmet",
        "offset": {
          "x": 4,
          "y": 2
        }
      }
    ]
  },
  {
    "id": "blacksmith",
    "name": "Blacksmith",
    "description": "Forges tools for settlers",
    "category": "metalwork",
    "icon": "\ud83d\udee0\ufe0f",
    "sprite": {
      "foundation": "building_foundation",
      "completed": "sawmill"
    },
    "footprint": {
      "width": 3,
      "height": 3
    },
    "constructionTime": 20,
    "costs": [
      {
        "itemType": "logs",
        "quantity": 2
      },
      {
        "itemType": "stone",
        "quantity": 2
      }
    ],
    "requiredProfession": "metallurgist",
    "workerSlots": 1,
    "productionRecipes": [
      {
        "id": "axe",
        "inputs": [
          {
            "itemType": "iron_bar",
            "quantity": 1
          },
          {
            "itemType": "logs",
            "quantity": 1
          }
        ],
        "outputs": [
          {
            "itemType": "axe",
            "quantity": 1
          }
        ],
        "productionTime": 12
      },
      {
        "id": "pickaxe",
        "inputs": [
          {
            "itemType": "iron_bar",
            "quantity": 1
          },
          {
            "itemType": "logs",
            "quantity": 1
          }
        ],
        "outputs": [
          {
            "itemType": "pickaxe",
            "quantity": 1
          }
        ],
        "productionTime": 12
      },
      {
        "id": "hammer",
        "inputs": [
          {
            "itemType": "iron_bar",
            "quantity": 2
          },
          {
            "itemType": "logs",
            "quantity": 1
          }
        ],
        "outputs": [
          {
            "itemType": "hammer",
            "quantity": 1
          }
        ],
        "productionTime": 12
      }
    ],
    "productionPlanDefaults": {
      "axe": 1,
      "pickaxe": 1,
      "hammer": 1
    },
    "storageSlots": [
      {
        "itemType": "iron_bar",
        "offset": {
          "x": 3,
          "y": 0
        }
      },
      {
        "itemType": "logs",
        "offset": {
          "x": 3,
          "y": 1
        }
      },
      {
        "itemType": "axe",
        "offset": {
          "x": 4,
          "y": 0
        }
      },
      {
        "itemType": "pickaxe",
        "offset": {
          "x": 4,
          "y": 1
        }
      },
      {
        "itemType": "hammer",
        "offset": {
          "x": 4,
          "y": 2
        }
      }
    ]
  },
  {
    "id": "well",
    "name": "Well",
    "description": "Draws clean water for the settlement",
    "category": "civil",
    "icon": "\ud83e\udea3",
    "sprite": {
      "foundation": "building_foundation",
      "completed": "storehouse"
    },
    "footprint": {
      "width": 2,
      "height": 2
    },
    "constructionTime": 10,
    "costs": [
      {
        "itemType": "logs",
        "quantity": 1
      },
      {
        "itemType": "stone",
        "quantity": 2
      }
    ],
    "autoProduction": {
      "inputs": [],
      "outputs": [
        {
          "itemType": "water",
          "quantity": 1
        }
      ],
      "productionTime": 5
    },
    "storageSlots": [
      {
        "itemType": "water",
        "offset": {
          "x": 2,
          "y": 0
        }
      }
    ]
  },
  {
    "id": "windmill",
    "name": "Windmill",
    "description": "Turns grain into flour",
    "category": "food",
    "icon": "\ud83c\udf2c\ufe0f",
    "sprite": {
      "foundation": "building_foundation",
      "completed": "sawmill"
    },
    "footprint": {
      "width": 3,
      "height": 3
    },
    "constructionTime": 20,
    "costs": [
      {
        "itemType": "logs",
        "quantity": 2
      },
      {
        "itemType": "stone",
        "quantity": 1
      },
      {
        "itemType": "planks",
        "quantity": 1
      }
    ],
    "requiredProfession": "miller",
    "workerSlots": 1,
    "productionRecipe": {
      "inputs": [
        {
          "itemType": "grain",
          "quantity": 1
        }
      ],
      "outputs": [
        {
          "itemType": "flour",
          "quantity": 1
        }
      ],
      "productionTime": 10
    },
    "render": {
      "modelSrc": "/assets/library/windmill.glb",
      "transform": {
        "scale": {
          "x": 2,
          "y": 2,
          "z": 2
        },
        "elevation": -0.23
      }
    },
    "storageSlots": [
      {
        "itemType": "grain",
        "offset": {
          "x": 3,
          "y": 0
        }
      },
      {
        "itemType": "flour",
        "offset": {
          "x": 3,
          "y": 1
        }
      }
    ],
    "entryPoint": {
      "x": 2.5,
      "y": 1.5
    },
    "centerPoint": {
      "x": 1.5,
      "y": 1.5
    }
  },
  {
    "id": "bakery",
    "name": "Bakery",
    "description": "Bakes bread from flour and water",
    "category": "food",
    "icon": "\ud83e\udd56",
    "sprite": {
      "foundation": "building_foundation",
      "completed": "sawmill"
    },
    "footprint": {
      "width": 3,
      "height": 3
    },
    "constructionTime": 22,
    "costs": [
      {
        "itemType": "logs",
        "quantity": 2
      },
      {
        "itemType": "stone",
        "quantity": 2
      },
      {
        "itemType": "planks",
        "quantity": 1
      }
    ],
    "requiredProfession": "baker",
    "workerSlots": 1,
    "productionRecipe": {
      "inputs": [
        {
          "itemType": "flour",
          "quantity": 1
        },
        {
          "itemType": "water",
          "quantity": 1
        }
      ],
      "outputs": [
        {
          "itemType": "bread",
          "quantity": 1
        }
      ],
      "productionTime": 12
    },
    "storageSlots": [
      {
        "itemType": "flour",
        "offset": {
          "x": 3,
          "y": 0
        }
      },
      {
        "itemType": "water",
        "offset": {
          "x": 3,
          "y": 1
        }
      },
      {
        "itemType": "bread",
        "offset": {
          "x": 3,
          "y": 2
        }
      }
    ]
  },
  {
    "id": "farm",
    "name": "Farm",
    "description": "Plants and harvests wheat",
    "category": "food",
    "icon": "\ud83c\udf3e",
    "sprite": {
      "foundation": "building_foundation",
      "completed": "storehouse"
    },
    "footprint": {
      "width": 3,
      "height": 3
    },
    "constructionTime": 18,
    "costs": [
      {
        "itemType": "logs",
        "quantity": 2
      },
      {
        "itemType": "stone",
        "quantity": 1
      }
    ],
    "requiredProfession": "farmer",
    "workerSlots": 1,
    "farm": {
      "cropNodeType": "wheat_crop",
      "plotRadiusTiles": 6,
      "plantTimeMs": 2000,
      "growTimeMs": 30000,
      "maxPlots": 12,
      "postPlantReturnWaitMs": 0,
      "spoilTimeMs": 20000,
      "despawnTimeMs": 20000
    },
    "render": {
      "modelSrc": "/assets/library/farmhouse.glb",
      "transform": {
        "rotation": {
          "x": 0,
          "y": 1.5707963267948966,
          "z": 0
        },
        "scale": {
          "x": 1.8,
          "y": 1.8,
          "z": 1.8
        }
      }
    },
    "storageSlots": [
      {
        "itemType": "grain",
        "offset": {
          "x": 3,
          "y": 0
        }
      }
    ]
  },
  {
    "id": "market",
    "name": "Market",
    "description": "A place for settlers to get fresh bread",
    "category": "food",
    "icon": "\ud83d\uded2",
    "sprite": {
      "foundation": "building_foundation",
      "completed": "storehouse"
    },
    "render": {
      "modelSrc": "/assets/library/agora.glb",
      "transform": {
        "rotation": {
          "x": 0,
          "y": 0,
          "z": 0
        },
        "scale": {
          "x": 1.7,
          "y": 1.7,
          "z": 1.7
        },
        "elevation": 0
      }
    },
    "footprint": {
      "width": 3,
      "height": 3
    },
    "constructionTime": 14,
    "costs": [
      {
        "itemType": "logs",
        "quantity": 2
      },
      {
        "itemType": "planks",
        "quantity": 1
      }
    ],
    "consumes": [
      {
        "itemType": "bread",
        "desiredQuantity": 20
      },
      {
        "itemType": "carrot",
        "desiredQuantity": 12
      }
    ],
    "requiredProfession": "vendor",
    "workerSlots": 1,
    "marketDistribution": {
      "maxDistanceTiles": 24,
      "maxStops": 8,
      "roadSearchRadiusTiles": 8,
      "houseSearchRadiusTiles": 3,
      "carryQuantity": 8,
      "deliveryQuantity": 2
    },
    "amenitySlots": {
      "count": 3
    },
    "storageSlots": [
      {
        "itemType": "bread",
        "offset": {
          "x": 3,
          "y": 0
        }
      },
      {
        "itemType": "carrot",
        "offset": {
          "x": 3,
          "y": 1
        }
      }
    ]
  },
  {
    "id": "inn",
    "name": "Inn",
    "description": "A modest inn offering a quick rest and meal",
    "category": "civil",
    "icon": "\ud83c\udfe8",
    "sprite": {
      "foundation": "building_foundation",
      "completed": "storehouse"
    },
    "footprint": {
      "width": 3,
      "height": 3
    },
    "constructionTime": 16,
    "costs": [
      {
        "itemType": "logs",
        "quantity": 2
      },
      {
        "itemType": "planks",
        "quantity": 2
      },
      {
        "itemType": "stone",
        "quantity": 1
      }
    ],
    "amenitySlots": {
      "count": 3
    },
    "amenityNeeds": {
      "hunger": 0.6,
      "fatigue": 0.6
    },
    "consumes": [
      {
        "itemType": "bread",
        "desiredQuantity": 10
      }
    ],
    "storageSlots": [
      {
        "itemType": "bread",
        "offset": {
          "x": 3,
          "y": 0
        }
      }
    ]
  },
  {
    "id": "trading_post",
    "name": "Trading Post",
    "description": "A hub for land trade routes and caravan shipments",
    "category": "infrastructure",
    "icon": "\ud83c\udfea",
    "sprite": {
      "foundation": "building_foundation",
      "completed": "storehouse"
    },
    "render": {
      "modelSrc": "/assets/library/agora.glb",
      "transform": {
        "rotation": {
          "x": 0,
          "y": 0,
          "z": 0
        },
        "scale": {
          "x": 1.6,
          "y": 1.6,
          "z": 1.6
        },
        "elevation": 0
      }
    },
    "footprint": {
      "width": 3,
      "height": 3
    },
    "constructionTime": 18,
    "costs": [
      {
        "itemType": "logs",
        "quantity": 2
      },
      {
        "itemType": "planks",
        "quantity": 2
      },
      {
        "itemType": "stone",
        "quantity": 2
      }
    ],
    "unlockFlags": [
      "charter:market-town"
    ],
    "isTradingPost": true,
    "storageSlots": [
      {
        "itemType": "*",
        "maxQuantity": 20,
        "role": "incoming",
        "offset": {
          "x": 1,
          "y": 1
        }
      },
      {
        "itemType": "*",
        "maxQuantity": 20,
        "role": "outgoing",
        "offset": {
          "x": 2,
          "y": 1
        }
      }
    ]
  }
];
