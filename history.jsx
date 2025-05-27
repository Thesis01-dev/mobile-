import { db } from "@/firebase";
import { Ionicons } from "@expo/vector-icons";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import {
    addDoc,
    collection, // Import updateDoc to mark booking as reviewed
    doc,
    getDocs,
    query,
    Timestamp, // Import addDoc for saving reviews
    updateDoc,
    where,
} from "firebase/firestore";
import React, { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Image,
    Modal,
    RefreshControl,
    SafeAreaView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import StarRating from 'react-native-star-rating-widget'; // We'll use this for star ratings

const BookedCarsList = () => {
    const [bookings, setBookings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedStatus, setSelectedStatus] = useState("All");
    const [refreshing, setRefreshing] = useState(false);
    const [currentUser, setCurrentUser] = useState(null);
    const auth = getAuth();

    // Modal State for Booking Details
    const [detailsModalVisible, setDetailsModalVisible] = useState(false);
    const [selectedBookingDetails, setSelectedBookingDetails] = useState(null);

    // Modal State for Reviews
    const [reviewModalVisible, setReviewModalVisible] = useState(false);
    const [bookingToReview, setBookingToReview] = useState(null);
    const [rating, setRating] = useState(0);
    const [reviewText, setReviewText] = useState("");

    // Helper function to safely format dates
    const safeFormatDate = useCallback((firebaseTimestamp) => {
        if (firebaseTimestamp instanceof Timestamp) {
            return firebaseTimestamp.toDate().toLocaleDateString();
        }
        if (typeof firebaseTimestamp === "string") {
            const date = new Date(firebaseTimestamp);
            return isNaN(date.getTime()) ? "N/A" : date.toLocaleDateString();
        }
        return "N/A";
    }, []);

    const fetchBookings = useCallback(async () => {
        setLoading(true);
        setRefreshing(true);

        if (!currentUser) {
            console.log("[fetchBookings] No logged in user, skipping fetch.");
            setBookings([]);
            setLoading(false);
            setRefreshing(false);
            return;
        }

        const bookingsRef = collection(db, "bookings");
        let q = query(bookingsRef, where("userId", "==", currentUser.uid));

        if (selectedStatus !== "All") {
            q = query(q, where("status", "==", selectedStatus));
        }

        try {
            const snapshot = await getDocs(q);
            const results = [];
            snapshot.forEach((doc) => {
                const data = doc.data();
                results.push({
                    id: doc.id,
                    businessName: data.ownerName ?? "Rental Provider",
                    carModel:
                        `${data.vehicleBrand ?? ""} ${data.vehicleModel ?? ""}`.trim() ||
                        "Unknown Car",
                    licensePlate: data.vehicleNumber ?? "N/A",
                    customerName: data.name ?? "Unknown Customer",
                    bookingDate: safeFormatDate(data.timestamp),
                    pickupDate: safeFormatDate(data.startDate),
                    returnDate: safeFormatDate(data.endDate),
                    totalPrice: `$${parseFloat(data.price ?? 0).toFixed(2)}`,
                    status: data.status ?? "Pending",
                    carImage: data.vehicleImageUrl || "https://via.placeholder.com/150",
                    pickupLocation: data.pickupLocation ?? "Not specified",
                    dropoffLocation: data.dropoffLocation ?? "Not specified",
                    contactNumber: data.contactNumber ?? "N/A",
                    hasReviewed: data.hasReviewed || false, // Track if reviewed
                    vehicleId: data.vehicleId, // Ensure vehicleId is passed
                    ownerId: data.ownerId, // Ensure ownerId is passed
                });
            });

            setBookings(results);
        } catch (error) {
            console.error("[fetchBookings] Failed:", error);
            Alert.alert("Error loading bookings", error.message);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [currentUser, selectedStatus, safeFormatDate]);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            setCurrentUser(user);
            if (!user) {
                setLoading(false);
                setRefreshing(false);
                setBookings([]);
            }
        });
        return unsubscribe;
    }, [auth]);

    useEffect(() => {
        fetchBookings();
    }, [fetchBookings]);

    const handleRefresh = () => {
        setRefreshing(true);
        fetchBookings();
    };

    const filteredBookings = bookings.filter((booking) => {
        const searchLower = searchQuery.toLowerCase();
        const matchesSearch =
            booking.businessName.toLowerCase().includes(searchLower) ||
            booking.carModel.toLowerCase().includes(searchLower) ||
            booking.customerName.toLowerCase().includes(searchLower) ||
            booking.licensePlate.toLowerCase().includes(searchLower);

        return matchesSearch;
    });

    const statusOptions = [
        "All",
        "Accepted",
        "Pending",
        "Completed",
        "Cancelled",
    ];

    // Function to open the booking details modal
    const handleViewDetails = (booking) => {
        setSelectedBookingDetails(booking);
        setDetailsModalVisible(true);
    };

    // Function to close the booking details modal
    const closeDetailsModal = () => {
        setDetailsModalVisible(false);
        setSelectedBookingDetails(null);
    };

    // Function to open the review modal
    const handleReviewPress = (booking) => {
        if (booking.hasReviewed) {
            Alert.alert("Already Reviewed", "You have already submitted a review for this booking.");
            return;
        }
        setBookingToReview(booking);
        setReviewModalVisible(true);
    };

    // Function to submit the review
    const handleSubmitReview = async () => {
        if (!bookingToReview || rating === 0) {
            Alert.alert("Error", "Please provide a rating and a review.");
            return;
        }

        try {
            await addDoc(collection(db, "reviews"), {
                bookingId: bookingToReview.id,
                userId: currentUser.uid,
                vehicleId: bookingToReview.vehicleId,
                ownerId: bookingToReview.ownerId,
                rating: rating,
                reviewText: reviewText,
                timestamp: Timestamp.now(),
            });

            // Mark the booking as reviewed in Firestore
            const bookingDocRef = doc(db, "bookings", bookingToReview.id);
            await updateDoc(bookingDocRef, {
                hasReviewed: true,
            });

            Alert.alert("Success", "Your review has been submitted!");
            closeReviewModal();
            fetchBookings(); // Refresh bookings to update 'hasReviewed' status
        } catch (error) {
            console.error("Error submitting review:", error);
            Alert.alert("Error", "Failed to submit review: " + error.message);
        }
    };

    // Function to close the review modal
    const closeReviewModal = () => {
        setReviewModalVisible(false);
        setBookingToReview(null);
        setRating(0);
        setReviewText("");
    };

    const renderBookingItem = ({ item }) => (
        <View style={styles.bookingCard}>
            <View style={styles.cardHeader}>
                <Text style={styles.businessName}>{item.businessName}</Text>
                <View
                    style={[
                        styles.statusBadge,
                        { backgroundColor: getStatusColor(item.status) },
                    ]}
                >
                    <Text style={styles.statusText}>{item.status}</Text>
                </View>
            </View>

            <View style={styles.cardContent}>
                <Image
                    source={{ uri: item.carImage }}
                    style={styles.carImage}
                    resizeMode="cover"
                />

                <View style={styles.bookingDetails}>
                    <Text style={styles.carModel}>{item.carModel}</Text>
                    <Text style={styles.licensePlate}>{item.licensePlate}</Text>

                    <View style={styles.detailRow}>
                        <Ionicons name="person-outline" size={16} color="#555" />
                        <Text style={styles.detailText}>{item.customerName}</Text>
                    </View>

                    <View style={styles.detailRow}>
                        <Ionicons name="calendar-outline" size={16} color="#555" />
                        <Text style={styles.detailText}>
                            {item.pickupDate} to {item.returnDate}
                        </Text>
                    </View>

                    <View style={styles.detailRow}>
                        <Ionicons name="cash-outline" size={16} color="#555" />
                        <Text style={styles.detailText}>{item.totalPrice}</Text>
                    </View>
                </View>
            </View>

            <View style={styles.cardFooter}>
                <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => handleViewDetails(item)}
                >
                    <Text style={styles.actionText}>View Details</Text>
                </TouchableOpacity>
                {item.status === "completed" && !item.hasReviewed && ( // Only show review button if completed and not reviewed
                    <TouchableOpacity
                        style={[styles.actionButton, styles.primaryButton]}
                        onPress={() => handleReviewPress(item)}
                    >
                        <Text style={[styles.actionText, { color: "white" }]}>Leave Review</Text>
                    </TouchableOpacity>
                )}
                {item.status === "completed" && item.hasReviewed && ( // Show "Reviewed" if completed and reviewed
                    <View style={[styles.actionButton, styles.reviewedButton]}>
                        <Text style={[styles.actionText, { color: "green" }]}>Reviewed</Text>
                    </View>
                )}
                {item.status !== "completed" && ( // Show Contact if not completed
                    <TouchableOpacity
                        style={[styles.actionButton, styles.primaryButton]}
                        onPress={() => Alert.alert("Contact", `Contact ${item.customerName}`)}
                    >
                        <Text style={[styles.actionText, { color: "white" }]}>Contact</Text>
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );

    const getStatusColor = (status) => {
        switch (status) {
            case "accepdted":
                return "#4CAF50";
            case "pending":
                return "#FFC107";
            case "completed":
                return "#2196F3";
            case "cancelled":
                return "#F44336";
            default:
                return "#9E9E9E";
        }
    };

    if (loading && !refreshing) {
        return (
            <SafeAreaView style={[styles.container, styles.loadingContainer]}>
                <ActivityIndicator size="large" color="#1E88E5" />
                <Text style={styles.loadingText}>Loading bookings...</Text>
                <Text style={styles.debugText}>
                    User: {currentUser ? currentUser.uid : "Not logged in"}
                </Text>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" />

            <View style={styles.header}>
                <Text style={styles.headerTitle}>Booked Cars</Text>
                <Text style={styles.debugTextSmall}>
                    {currentUser ? `User: ${currentUser.email}` : "Please sign in"}
                </Text>
            </View>

            <View style={styles.searchContainer}>
                <Ionicons
                    name="search-outline"
                    size={20}
                    color="#777"
                    style={styles.searchIcon}
                />
                <TextInput
                    style={styles.searchInput}
                    placeholder="Search by business, car, customer..."
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholderTextColor="#999"
                />
            </View>

            <View style={styles.filterContainer}>
                {statusOptions.map((status) => (
                    <TouchableOpacity
                        key={status}
                        style={[
                            styles.filterButton,
                            selectedStatus === status && styles.filterButtonActive,
                        ]}
                        onPress={() => setSelectedStatus(status)}
                    >
                        <Text
                            style={[
                                styles.filterButtonText,
                                selectedStatus === status && styles.filterButtonTextActive,
                            ]}
                        >
                            {status}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            <FlatList
                data={filteredBookings}
                renderItem={renderBookingItem}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContent}
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Ionicons name="car-sport-outline" size={50} color="#ccc" />
                        <Text style={styles.emptyText}>
                            {currentUser
                                ? selectedStatus === "All"
                                    ? "No bookings found."
                                    : `No "${selectedStatus}" bookings found.`
                                : "Please sign in to view bookings"}
                        </Text>
                        <TouchableOpacity
                            style={styles.retryButton}
                            onPress={fetchBookings}
                        >
                            <Text style={styles.retryButtonText}>Refresh</Text>
                        </TouchableOpacity>
                    </View>
                }
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={handleRefresh}
                        colors={["#1E88E5"]}
                        tintColor="#1E88E5"
                    />
                }
            />

            {/* Booking Details Modal */}
            <Modal
                animationType="slide"
                transparent={true}
                visible={detailsModalVisible}
                onRequestClose={closeDetailsModal}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        {selectedBookingDetails && (
                            <>
                                <Text style={styles.modalTitle}>Booking Details</Text>
                                <Image
                                    source={{ uri: selectedBookingDetails.carImage }}
                                    style={styles.modalCarImage}
                                    resizeMode="cover"
                                />
                                <Text style={styles.modalCarModel}>
                                    {selectedBookingDetails.carModel}
                                </Text>
                                <Text style={styles.modalDetailText}>
                                    <Text style={styles.modalDetailLabel}>Business:</Text>{" "}
                                    {selectedBookingDetails.businessName}
                                </Text>
                                <Text style={styles.modalDetailText}>
                                    <Text style={styles.modalDetailLabel}>License Plate:</Text>{" "}
                                    {selectedBookingDetails.licensePlate}
                                </Text>
                                <Text style={styles.modalDetailText}>
                                    <Text style={styles.modalDetailLabel}>Customer:</Text>{" "}
                                    {selectedBookingDetails.customerName}
                                </Text>
                                <Text style={styles.modalDetailText}>
                                    <Text style={styles.modalDetailLabel}>Booking Date:</Text>{" "}
                                    {selectedBookingDetails.bookingDate}
                                </Text>
                                <Text style={styles.modalDetailText}>
                                    <Text style={styles.modalDetailLabel}>Pickup Date:</Text>{" "}
                                    {selectedBookingDetails.pickupDate}
                                </Text>
                                <Text style={styles.modalDetailText}>
                                    <Text style={styles.modalDetailLabel}>Return Date:</Text>{" "}
                                    {selectedBookingDetails.returnDate}
                                </Text>
                                <Text style={styles.modalDetailText}>
                                    <Text style={styles.modalDetailLabel}>Total Price:</Text>{" "}
                                    {selectedBookingDetails.totalPrice}
                                </Text>
                                <Text style={styles.modalDetailText}>
                                    <Text style={styles.modalDetailLabel}>Status:</Text>{" "}
                                    {selectedBookingDetails.status}
                                </Text>
                                <Text style={styles.modalDetailText}>
                                    <Text style={styles.modalDetailLabel}>Pickup Location:</Text>{" "}
                                    {selectedBookingDetails.pickupLocation}
                                </Text>
                                <Text style={styles.modalDetailText}>
                                    <Text style={styles.modalDetailLabel}>Dropoff Location:</Text>{" "}
                                    {selectedBookingDetails.dropoffLocation}
                                </Text>
                                <Text style={styles.modalDetailText}>
                                    <Text style={styles.modalDetailLabel}>Contact Number:</Text>{" "}
                                    {selectedBookingDetails.contactNumber}
                                </Text>
                                <TouchableOpacity style={styles.modalCloseButton} onPress={closeDetailsModal}>
                                    <Text style={styles.modalCloseButtonText}>Close</Text>
                                </TouchableOpacity>
                            </>
                        )}
                    </View>
                </View>
            </Modal>

            {/* Review Modal */}
            <Modal
                animationType="slide"
                transparent={true}
                visible={reviewModalVisible}
                onRequestClose={closeReviewModal}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Rate Your Experience</Text>
                        {bookingToReview && (
                            <>
                                <Text style={styles.reviewModalCar}>
                                    {bookingToReview.carModel} from {bookingToReview.businessName}
                                </Text>
                                <StarRating
                                    rating={rating}
                                    onChange={setRating}
                                    maxStars={5}
                                    starSize={35}
                                    color="#FFC107" // Gold/yellow color for stars
                                    enableHalfStar={false}
                                    style={{ marginBottom: 15 }}
                                />
                                <TextInput
                                    style={styles.reviewTextInput}
                                    placeholder="Share your thoughts about this rental..."
                                    placeholderTextColor="#999"
                                    multiline
                                    numberOfLines={4}
                                    value={reviewText}
                                    onChangeText={setReviewText}
                                />
                                <View style={styles.modalButtonContainer}>
                                    <TouchableOpacity style={styles.modalCloseButton} onPress={closeReviewModal}>
                                        <Text style={styles.modalCloseButtonText}>Cancel</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[styles.modalCloseButton, styles.modalSubmitButton]}
                                        onPress={handleSubmitReview}
                                    >
                                        <Text style={styles.modalCloseButtonText}>Submit Review</Text>
                                    </TouchableOpacity>
                                </View>
                            </>
                        )}
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#f5f5f5",
    },
    header: {
        padding: 16,
        backgroundColor: "white",
        borderBottomWidth: 1,
        borderBottomColor: "#eee",
    },
    headerTitle: {
        fontSize: 24,
        fontWeight: "bold",
        color: "#333",
        textAlign: "center",
    },
    debugTextSmall: {
        fontSize: 12,
        color: "#666",
        textAlign: "center",
        marginTop: 4,
    },
    searchContainer: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "white",
        margin: 16,
        borderRadius: 8,
        paddingHorizontal: 12,
        elevation: 2,
    },
    searchIcon: {
        marginRight: 8,
    },
    searchInput: {
        flex: 1,
        height: 45,
        fontSize: 16,
        color: "#333",
    },
    filterContainer: {
        flexDirection: "row",
        paddingHorizontal: 16,
        marginBottom: 8,
        flexWrap: "wrap",
    },
    filterButton: {
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 20,
        backgroundColor: "#eee",
        marginRight: 8,
        marginBottom: 8,
    },
    filterButtonActive: {
        backgroundColor: "#1E88E5",
    },
    filterButtonText: {
        color: "#555",
        fontSize: 14,
    },
    filterButtonTextActive: {
        color: "white",
    },
    listContent: {
        paddingHorizontal: 16,
        paddingBottom: 16,
    },
    bookingCard: {
        backgroundColor: "white",
        borderRadius: 10,
        marginBottom: 16,
        overflow: "hidden",
        elevation: 2,
    },
    cardHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        padding: 12,
        borderBottomWidth: 1,
        borderBottomColor: "#f0f0f0",
    },
    businessName: {
        fontSize: 16,
        fontWeight: "bold",
        color: "#333",
        flex: 1,
    },
    statusBadge: {
        paddingVertical: 4,
        paddingHorizontal: 8,
        borderRadius: 12,
        marginLeft: 8,
    },
    statusText: {
        color: "white",
        fontSize: 12,
        fontWeight: "bold",
    },
    cardContent: {
        flexDirection: "row",
        padding: 12,
    },
    carImage: {
        width: 100,
        height: 70,
        borderRadius: 6,
        marginRight: 12,
        backgroundColor: "#f0f0f0",
    },
    bookingDetails: {
        flex: 1,
    },
    carModel: {
        fontSize: 16,
        fontWeight: "600",
        color: "#333",
        marginBottom: 2,
    },
    licensePlate: {
        fontSize: 14,
        color: "#666",
        marginBottom: 8,
    },
    detailRow: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 4,
    },
    detailText: {
        fontSize: 14,
        color: "#555",
        marginLeft: 6,
    },
    cardFooter: {
        flexDirection: "row",
        justifyContent: "space-between",
        padding: 12,
        borderTopWidth: 1,
        borderTopColor: "#f0f0f0",
    },
    actionButton: {
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: "#ddd",
    },
    primaryButton: {
        backgroundColor: "#1E88E5",
        borderColor: "#1E88E5",
    },
    actionText: {
        fontSize: 14,
        fontWeight: "500",
    },
    emptyContainer: {
        alignItems: "center",
        justifyContent: "center",
        padding: 40,
    },
    emptyText: {
        fontSize: 16,
        color: "#777",
        marginTop: 16,
        textAlign: "center",
    },
    retryButton: {
        marginTop: 20,
        paddingVertical: 10,
        paddingHorizontal: 20,
        backgroundColor: "#1E88E5",
        borderRadius: 5,
    },
    retryButtonText: {
        color: "white",
        fontWeight: "bold",
    },
    loadingContainer: {
        justifyContent: "center",
        alignItems: "center",
        flex: 1,
    },
    loadingText: {
        marginTop: 10,
        color: "#666",
    },
    debugText: {
        marginTop: 10,
        color: "#999",
        fontSize: 12,
    },

    // Modal Styles (for both details and review modals)
    modalOverlay: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "rgba(0, 0, 0, 0.5)",
    },
    modalContent: {
        backgroundColor: "white",
        borderRadius: 10,
        padding: 20,
        width: "90%",
        maxHeight: "80%",
        alignItems: "center",
        elevation: 5,
    },
    modalTitle: {
        fontSize: 22,
        fontWeight: "bold",
        marginBottom: 15,
        color: "#333",
    },
    modalCarImage: {
        width: "100%",
        height: 150,
        borderRadius: 8,
        marginBottom: 15,
        backgroundColor: "#f0f0f0",
    },
    modalCarModel: {
        fontSize: 18,
        fontWeight: "600",
        color: "#333",
        marginBottom: 10,
        textAlign: "center",
    },
    modalDetailText: {
        fontSize: 15,
        color: "#555",
        marginBottom: 5,
        width: "100%",
    },
    modalDetailLabel: {
        fontWeight: "bold",
        color: "#333",
    },
    modalCloseButton: {
        marginTop: 10,
        paddingVertical: 10,
        paddingHorizontal: 20,
        backgroundColor: "#6c757d", // Grey for close/cancel
        borderRadius: 8,
    },
    modalCloseButtonText: {
        color: "white",
        fontWeight: "bold",
        fontSize: 16,
    },

    // Review Modal specific styles
    reviewModalCar: {
        fontSize: 16,
        color: "#666",
        marginBottom: 15,
        textAlign: "center",
        fontStyle: 'italic',
    },
    reviewTextInput: {
        borderWidth: 1,
        borderColor: "#ddd",
        borderRadius: 8,
        padding: 10,
        width: "100%",
        minHeight: 100,
        textAlignVertical: "top", // Align text to the top for multiline
        marginBottom: 15,
        fontSize: 16,
    },
    modalButtonContainer: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        width: '100%',
    },
    modalSubmitButton: {
        backgroundColor: "#1E88E5", // Blue for submit
        marginLeft: 10,
    },
    reviewedButton: {
        backgroundColor: '#E0E0E0', // Light grey
        borderColor: '#CCC',
    }
});

export default BookedCarsList;