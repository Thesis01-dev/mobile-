import { auth, db } from "@/firebase"; // Assuming your Firebase config
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
    addDoc,
    collection,
    doc,
    getDoc,
    limit,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    setDoc,
    updateDoc,
    where
} from "firebase/firestore";
import React, { useCallback, useEffect, useState } from "react"; // Removed useRef as flatListRef is removed
import {
    ActivityIndicator,
    Platform,
    SafeAreaView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from "react-native";
import { Bubble, GiftedChat, InputToolbar } from 'react-native-gifted-chat'; // We'll use GiftedChat for a robust solution

// Removed formatTimestamp as it's not explicitly used by GiftedChat's default rendering
// If you wish to use a custom format, you'd re-add this and pass it to GiftedChat's renderTime prop.
// const formatTimestamp = (timestamp) => {
//     if (!timestamp) return '';
//     const date = timestamp instanceof Date ? timestamp : timestamp.toDate();
//     const now = new Date();
//     const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
//     const messageDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

//     if (messageDate.getTime() === today.getTime()) {
//         return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); // e.g., "03:30 PM"
//     } else if (messageDate.getTime() === new Date(today.getTime() - 24 * 60 * 60 * 1000).getTime()) {
//         return 'Yesterday';
//     } else {
//         return date.toLocaleDateString([], { month: 'short', day: 'numeric' }); // e.g., "Jan 1"
//     }
// };


const ChatScreen = () => {
    const router = useRouter();
    const { recipientId, recipientName: paramRecipientName, recipientImage: paramRecipientImage, vehicleName: paramVehicleName } = useLocalSearchParams();

    const [messages, setMessages] = useState([]);
    const [currentUser, setCurrentUser] = useState(null); // Firestore user data
    const [loading, setLoading] = useState(true);
    const [chatDocId, setChatDocId] = useState(null); // The ID of the chat document in Firestore

    // Removed flatListRef as it was unused and GiftedChat handles its own scrolling
    // const flatListRef = useRef(null); // For auto-scrolling

    // Effect for user authentication and fetching current user data
    useEffect(() => {
        const unsubscribeAuth = auth.onAuthStateChanged(async (user) => {
            if (user) {
                const userDocRef = doc(db, "users", user.uid);
                const userDocSnap = await getDoc(userDocRef);
                if (userDocSnap.exists()) {
                    setCurrentUser({ uid: user.uid, ...userDocSnap.data() });
                } else {
                    // Handle case where user profile data is not found (e.g., new user)
                    setCurrentUser({ uid: user.uid, displayName: user.email, profileImage: null });
                }
            } else {
                router.replace('/login'); // Redirect if not authenticated
            }
            setLoading(false);
        });

        return () => unsubscribeAuth();
    }, [router]); // Added router to the dependency array of this useEffect


    // Effect to find/create chat document and listen for messages
    useEffect(() => {
        if (!currentUser || !recipientId) {
            return; // Wait for both user and recipientId to be available
        }

        const participants = [currentUser.uid, recipientId].sort(); // Ensure consistent ordering

        // Query for existing chat document
        const q = query(
            collection(db, "chats"),
            where("participants", "==", participants),
            limit(1) // Assuming only one chat per participant pair
        );

        const unsubscribe = onSnapshot(q, async (snapshot) => {
            if (!snapshot.empty) {
                const doc = snapshot.docs[0];
                setChatDocId(doc.id); // Found existing chat document
            } else {
                // No existing chat, create a new one (only if we're ready to send a message)
                // This logic is simplified; in a real app, you might create it on first message send
                console.log("No existing chat found. A new one will be created on first message.");
                setChatDocId(null); // Explicitly null if not found
            }

            // Now set up message listener for this chat
            if (chatDocId || snapshot.docs[0]?.id) { // Use found doc ID or new one
                const currentChatDocId = chatDocId || snapshot.docs[0]?.id;
                const messagesRef = collection(db, "chats", currentChatDocId, "messages");
                const messagesQuery = query(messagesRef, orderBy("createdAt", "desc")); // GiftedChat prefers descending

                const unsubscribeMessages = onSnapshot(messagesQuery, (msgSnapshot) => {
                    const loadedMessages = msgSnapshot.docs.map(doc => {
                        const data = doc.data();
                        return {
                            _id: doc.id,
                            text: data.text,
                            createdAt: data.createdAt?.toDate(), // Convert Firestore Timestamp to Date
                            user: {
                                _id: data.senderId,
                                name: data.senderName,
                                avatar: data.senderImage,
                            },
                        };
                    });
                    setMessages(loadedMessages);
                }, (error) => {
                    console.error("Error fetching messages:", error);
                });
                return () => unsubscribeMessages();
            }
        }, (error) => {
            console.error("Error finding/creating chat document:", error);
        });

        return () => unsubscribe();
    }, [currentUser, recipientId, chatDocId, router]); // Added router to the dependency array


    const onSend = useCallback(async (newMessages = []) => {
        if (!currentUser || !recipientId || newMessages.length === 0) return;

        const messageToSend = newMessages[0];
        const { text } = messageToSend;

        // Ensure participants are always sorted for consistent chat lookup
        const participants = [currentUser.uid, recipientId].sort();

        let currentChatRef;
        if (chatDocId) {
            // If chat document already exists, use its reference
            currentChatRef = doc(db, "chats", chatDocId);
        } else {
            // If no chat document exists, create a new one
            currentChatRef = doc(collection(db, "chats"));
            setChatDocId(currentChatRef.id); // Set the new chat doc ID

            await setDoc(currentChatRef, {
                participants: participants,
                createdAt: serverTimestamp(),
                lastMessageText: text,
                lastMessageTimestamp: serverTimestamp(),
                // Add any other chat metadata you need, e.g., related vehicle ID, names of participants
                participantNames: {
                    [currentUser.uid]: currentUser.displayName || currentUser.email,
                    [recipientId]: paramRecipientName, // Use param name passed from previous screen
                },
                participantImages: {
                    [currentUser.uid]: currentUser.profileImage || null,
                    [recipientId]: paramRecipientImage || null,
                },
                vehicleName: paramVehicleName || null, // Optional: link chat to a vehicle
            });
        }

        // Add message to subcollection
        await addDoc(collection(currentChatRef, "messages"), {
            text,
            createdAt: serverTimestamp(),
            senderId: currentUser.uid,
            senderName: currentUser.displayName || currentUser.email,
            senderImage: currentUser.profileImage || null,
        });

        // Update the last message and timestamp on the chat document itself
        await updateDoc(currentChatRef, {
            lastMessageText: text,
            lastMessageTimestamp: serverTimestamp(),
            // You might also want to update 'readBy' status here
        });

    }, [currentUser, recipientId, chatDocId, paramRecipientName, paramRecipientImage, paramVehicleName]);


    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#4285F4" />
            </View>
        );
    }

    // Fallback for missing recipient ID
    if (!recipientId) {
        return (
            <View style={styles.errorContainer}>
                <Text style={styles.errorText}>Recipient not specified. Please go back.</Text>
                <TouchableOpacity style={styles.backButtonBottom} onPress={() => router.back()}>
                    <Text style={styles.backButtonText}>Go Back</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor="#F5F5F5" />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity style={styles.headerIcon} onPress={() => router.back()}>
                    <MaterialIcons name="arrow-back" size={26} color="#333" />
                </TouchableOpacity>
                <View style={styles.headerTitleContainer}>
                    <Text style={styles.headerTitle} numberOfLines={1} ellipsizeMode="tail">
                        {paramRecipientName || "Chat"}
                    </Text>
                    {paramVehicleName && <Text style={styles.vehicleContext}>{paramVehicleName}</Text>}
                </View>
                <View style={styles.headerRightIcons}>
                    <TouchableOpacity style={styles.headerIcon}>
                        <Ionicons name="call" size={24} color="#333" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.headerIcon}>
                        <Ionicons name="videocam" size={24} color="#333" />
                    </TouchableOpacity>
                </View>
            </View>

            {/* GiftedChat Component */}
            <GiftedChat
                messages={messages}
                onSend={onSend}
                user={{
                    _id: currentUser?.uid,
                    name: currentUser?.displayName || currentUser?.email,
                    avatar: currentUser?.profileImage || null,
                }}
                renderBubble={(props) => (
                    <Bubble
                        {...props}
                        wrapperStyle={{
                            left: {
                                backgroundColor: '#E0E0E0', // Light grey for incoming messages
                                marginVertical: 4,
                            },
                            right: {
                                backgroundColor: '#4285F4', // Blue for outgoing messages
                                marginVertical: 4,
                            },
                        }}
                        textStyle={{
                            left: {
                                color: '#333',
                            },
                            right: {
                                color: 'white',
                            },
                        }}
                        timeTextStyle={{
                            left: { color: '#888' },
                            right: { color: '#D0D0D0' },
                        }}
                    />
                )}
                renderInputToolbar={(props) => (
                    <InputToolbar
                        {...props}
                        containerStyle={styles.inputToolbar}
                        primaryStyle={styles.inputToolbarPrimary}
                    />
                )}
                textInputStyle={styles.textInput}
                renderAvatar={null} // Hide avatars inside message bubbles for a cleaner look if preferred
                showUserAvatar={false}
                showAvatarForEveryMessage={true}
                renderUsernameOnMessage={false}
                scrollToBottom
                scrollToBottomComponent={() => (
                    <MaterialIcons name="keyboard-arrow-down" size={30} color="#888" />
                )}
                renderLoading={() => (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color="#4285F4" />
                    </View>
                )}
            />
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#F5F5F5",
    },
    loadingContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "#F5F5F5",
    },
    errorContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        padding: 20,
        backgroundColor: "#F5F5F5",
    },
    errorText: {
        fontSize: 18,
        color: "#FF0000",
        marginBottom: 20,
        textAlign: 'center',
    },
    backButtonBottom: {
        backgroundColor: "#4285F4",
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 8,
    },
    backButtonText: {
        color: "white",
        fontSize: 16,
        fontWeight: "bold",
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 15,
        paddingVertical: 12,
        backgroundColor: "white",
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: "#E0E0E0",
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.1,
                shadowRadius: 2,
            },
            android: {
                elevation: 3,
            },
        }),
    },
    headerIcon: {
        padding: 5,
    },
    headerTitleContainer: {
        flex: 1,
        alignItems: "center",
        justifyContent: 'center',
        marginHorizontal: 10,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: "bold",
        color: "#333",
        maxWidth: '80%', // Limit width for long names
    },
    vehicleContext: {
        fontSize: 13,
        color: "#777",
        marginTop: 2,
    },
    headerRightIcons: {
        flexDirection: "row",
        gap: 10,
    },
    // GiftedChat specific styles
    inputToolbar: {
        backgroundColor: 'white',
        borderTopColor: '#E0E0E0',
        borderTopWidth: 1,
        paddingHorizontal: 5,
        paddingVertical: 5,
    },
    textInput: {
        color: '#333',
        backgroundColor: '#F0F0F0',
        borderRadius: 20,
        paddingHorizontal: 15,
        paddingTop: Platform.OS === 'ios' ? 10 : 8,
        paddingBottom: Platform.OS === 'ios' ? 10 : 8,
        lineHeight: 20, // Ensure consistent line height
        alignSelf: 'center',
    },
    // If you decide to customize send button or other parts of InputToolbar,
    // you'd add styles here and pass them via renderSend, renderCompser etc.
});

export default ChatScreen;