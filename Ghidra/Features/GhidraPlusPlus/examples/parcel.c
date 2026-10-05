/* A small, self-contained program for learning the investigation workflow.
 * Compile without debug symbols. It never reads files or opens the network.
 * The source is the ground truth for the example, not an input to analysis.
 */
#if defined(_MSC_VER)
#define KEEP __declspec(noinline)
#else
#define KEEP __attribute__((noinline))
#endif

typedef struct Parcel {
    unsigned int weight;
    unsigned int distance;
    unsigned int priority;
} Parcel;

KEEP unsigned int parse_unsigned(const char *text) {
    unsigned int value = 0;
    while (*text >= '0' && *text <= '9') {
        value = value * 10 + (unsigned int)(*text - '0');
        ++text;
    }
    return value;
}

KEEP unsigned int text_length(const char *text) {
    unsigned int length = 0;
    while (text[length]) ++length;
    return length;
}

KEEP int same_text(const char *left, const char *right) {
    while (*left && *left == *right) { ++left; ++right; }
    return (unsigned char)*left == (unsigned char)*right;
}

KEEP unsigned int shipping_cost(const Parcel *parcel) {
    unsigned int cost = 5 + parcel->weight * 2 + parcel->distance / 50;
    if (parcel->priority) cost += 10;
    return cost;
}

KEEP unsigned int checksum(const unsigned char *bytes, unsigned int count) {
    unsigned int sum = 0;
    for (unsigned int index = 0; index < count; ++index) sum += bytes[index];
    return sum;
}

int main(void) {
    const char *label = "Parcel priority delivery";
    Parcel parcel = {parse_unsigned("12"), parse_unsigned("250"), (unsigned int)same_text("priority", "priority")};
    unsigned int result = shipping_cost(&parcel) + checksum((const unsigned char *)label, text_length(label));
    return (int)(result & 255);
}
