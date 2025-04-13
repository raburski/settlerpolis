import { useEffect, useRef, useState } from 'react';
import { IRefPhaserGame, PhaserGame } from './game/PhaserGame';
import { Chat } from './game/components/Chat';
import { DisconnectModal } from './game/components/DisconnectModal';
import { Inventory } from './game/components/Inventory';
import { ChatLog } from './game/components/ChatLog';
import { DialogUI } from './game/components/DialogUI';
import { EventBus } from './game/EventBus';
import { Quests } from "./game/components/Quests";
import { SidePanel } from "./game/components/SidePanel";

function App()
{
    //  References to the PhaserGame component (game and scene are exposed)
    const phaserRef = useRef<IRefPhaserGame | null>(null);
    const [currentScene, setCurrentScene] = useState<Phaser.Scene | null>(null);

    const handleSceneChange = (scene: any) => {
        setCurrentScene(scene.scene.key);
    };

    const addSprite = () => {
        if (phaserRef.current)
        {
            const scene = phaserRef.current.scene;

            if (scene)
            {
                // Add a new sprite to the current scene at a random position
                const x = Phaser.Math.Between(64, scene.scale.width - 64);
                const y = Phaser.Math.Between(64, scene.scale.height - 64);
    
                //  `add.sprite` is a Phaser GameObjectFactory method and it returns a Sprite Game Object instance
                const star = scene.add.sprite(x, y, 'star');
    
            }
        }
    }


    return (
        <div id="app">
            <PhaserGame ref={phaserRef} currentActiveScene={handleSceneChange} />
            {currentScene && <Chat scene={currentScene} />}
            <DisconnectModal />
            <Inventory />
            <ChatLog />
            <Chat />
            <DialogUI />
            <Quests />
            <SidePanel />
        </div>
    )
}

export default App
