import { auth, db } from "@/firebase"; // Your Firebase config
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore"; // Import Firestore functions
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    Image,
    Platform,
    SafeAreaView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

const NewChatScreen = () => {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [users, setUsers] = useState([]); // List of users to choose from
    const [searchQuery, setSearchQuery] = useState("");

    useEffect(() => {
        const fetchUsers = () => {
            setLoading(true);
            const currentUserUid = auth.currentUser?.uid;
            if (!currentUserUid) {
                setLoading(false);
                return;
            }

            // Query all users except the current one
            // In a real app, you might want pagination or more specific filters
            const usersRef = collection(db, "users");
            const q = query(
                usersRef,
                // You might add a 'where' clause if you want to filter specific types of users (e.g., only owners)
                orderBy("displayName", "asc") // Order by name for easier Browse
                // limit(50) // Limit the number of users fetched for performance
            );

            const unsubscribe = onSnapshot(q, (snapshot) => {
                const fetchedUsers = snapshot.docs
                    .filter(doc => doc.id !== currentUserUid) // Exclude current user
                    .map(doc => ({
                        id: doc.id,
                        displayName: doc.data().displayName || doc.data().fullName || doc.data().email,
                        profileImage: doc.data().profileImage || null,
                        // Add any other user details you need
                    }));
                setUsers(fetchedUsers);
                setLoading(false);
            }, (error) => {
                console.error("Error fetching users for new chat:", error);
                setLoading(false);
            });

            return () => unsubscribe(); // Cleanup listener
        };

        fetchUsers();
    }, []);

    const filteredUsers = users.filter(user =>
        user.displayName.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const renderUserItem = ({ item }) => (
        <TouchableOpacity
            style={styles.userItem}
            onPress={() => {
                // Navigate to the ChatScreen with the selected user's details
                router.push({
                    pathname: `/chat/${item.id}`,
                    params: {
                        recipientId: item.id,
                        recipientName: item.displayName,
                        recipientImage: item.profileImage,
                        // No vehicleName here, as it's a new chat not yet tied to a specific booking
                    },
                });
            }}
        >
            <Image
                source={{ uri: item.profileImage || 'https://via.placeholder.com/150/CCCCCC/FFFFFF?text=User' }}
                style={styles.userItemImage}
            />
            <Text style={styles.userItemName}>{item.displayName}</Text>
        </TouchableOpacity>
    );

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor="#F5F5F5" />

            <View style={styles.header}>
                <TouchableOpacity style={styles.headerIcon} onPress={() => router.back()}>
                    <MaterialIcons name="arrow-back" size={26} color="#333" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Start New Chat</Text>
                <View style={styles.headerIconPlaceholder} /> {/* For spacing */}
            </View>

            <View style={styles.searchBarContainer}>
                <MaterialIcons name="search" size={20} color="#8A8A8E" style={styles.searchIcon} />
                <TextInput
                    style={styles.searchInput}
                    placeholder="Search users..."
                    placeholderTextColor="#8A8A8E"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                />
            </View>

            {loading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#4285F4" />
                </View>
            ) : (
                <FlatList
                    data={filteredUsers}
                    renderItem={renderUserItem}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={styles.userList}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={() => (
                        <View style={styles.emptyListContainer}>
                            <Text style={styles.emptyListText}>No users found.</Text>
                        </View>
                    )}
                />
            )}
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
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
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
    headerIconPlaceholder: {
        width: 36, // Match the size of the MaterialIcons for alignment
        height: 36,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: "bold",
        color: "#333",
        flex: 1,
        textAlign: "center",
    },
    searchBarContainer: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#E0E0E0",
        borderRadius: 25,
        marginHorizontal: 15,
        marginVertical: 10,
        paddingHorizontal: 15,
        paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    },
    searchIcon: {
        marginRight: 10,
    },
    searchInput: {
        flex: 1,
        color: "#333",
        fontSize: 16,
    },
    userList: {
        paddingHorizontal: 0,
        paddingTop: 5,
    },
    userItem: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 15,
        paddingHorizontal: 15,
        backgroundColor: "white",
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: "#EEE",
    },
    userItemImage: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: '#C4C4C4',
        marginRight: 15,
    },
    userItemName: {
        fontSize: 17,
        fontWeight: "600",
        color: "#333",
    },
    emptyListContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
        marginTop: 50,
    },
    emptyListText: {
        fontSize: 16,
        color: '#888',
        textAlign: 'center',
    },
});

export default NewChatScreen;