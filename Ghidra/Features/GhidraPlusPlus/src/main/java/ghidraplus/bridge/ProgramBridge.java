package ghidraplus.bridge;

import com.google.gson.JsonObject;
import java.nio.file.Path;
import java.util.function.Consumer;

/** The program operations shared by the desktop plugin and the headless application. */
public interface ProgramBridge extends AutoCloseable {
    JsonObject snapshot() throws Exception;
    /** Changes whenever the open program is edited, including edits made outside Ghidra++. */
    default long revision() { return 0; }
    JsonObject evidence(String address) throws Exception;
    void open(Path binary, Consumer<String> progress) throws Exception;
    String change(String address, String field, String value) throws Exception;
    boolean navigate(String address) throws Exception;
    String readState() throws Exception;
    void writeState(String json) throws Exception;
    void save() throws Exception;
    String exportSource() throws Exception;
    @Override void close() throws Exception;
}
