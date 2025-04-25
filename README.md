## Core Components:
 - EventBusManager: The central event bus that routes different types of events (client-to-server, server-to-client, server-to-server)
 - NetworkManager: Handles socket.io connections and network-level event routing
 - Event: A collection of all game-related events organized by domain (Players, Chat, System, etc.)
 - Receiver: Defines the possible event recipients (Sender, Group, NoSenderGroup, All, Client)
## Event Types:
 - cs: - Client to Server events
 - sc: - Server to Client events
 - ss: - Server to Server events (internal)
## Event Flow:
 - Client Connection:
When a client connects, NetworkManager creates a NetworkClient instance
Sets up event handlers for that client
Notifies joined callbacks
Tracks client activity with timestamps
 - Event Routing:
EventBusManager routes events based on their prefix:
cs: events are routed to registered handlers
sc: events are sent to clients via NetworkManager
ss: events are handled internally on the server
 - Group Management:
Clients can be organized into groups
Events can be sent to:
Individual client (Receiver.Sender)
All clients in a group (Receiver.Group)
Group except sender (Receiver.NoSenderGroup)
All connected clients (Receiver.All)
Specific client (Receiver.Client)
## Event Organization:
The system supports various game-related events through domain-specific modules:
 - Players
 - Chat
 - System
 - Inventory
 - NPC
 - Items
 - Loot
 - Dialogue
 - Quest
 - MapObjects
 - Flags
 - Affinity
 - FX
 - Cutscene
 - Map
 - Time
## Safety Features:
 - Inactive client detection (60-second timeout)
 - Error handling for event callbacks
 - Debug logging (when enabled)
 - Group cleanup on disconnect
 - Timestamp tracking for client activity
## This is a robust event system that provides:
 - Type safety through TypeScript
 - Flexible routing options
 - Group-based communication
 - Domain separation
 - Error handling
 - Connection management
 - Activity monitoring
