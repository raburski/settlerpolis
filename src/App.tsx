import { useRef } from 'react';
import { IRefPhaserGame, PhaserGame } from './game/PhaserGame';
import { Chat } from './game/components/Chat';
import { DisconnectModal } from './game/components/DisconnectModal';
import { Inventory } from './game/components/Inventory';
import { ChatLog } from './game/components/ChatLog';
import { DialogUI } from './game/components/DialogUI';
import { Quests } from "./game/components/Quests";
import { SidePanel } from "./game/components/SidePanel";

function App()
{
    //  References to the PhaserGame component (game and scene are exposed)
    const phaserRef = useRef<IRefPhaserGame | null>(null);

    return (
        <div id="app">
            <PhaserGame ref={phaserRef} />
            <Chat />
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
