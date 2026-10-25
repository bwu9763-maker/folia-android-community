package top.izuna.foliamajor;

import android.util.Base64;
import android.webkit.CookieManager;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;

import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

/**
 * FoliaBridge：Folia Android 扩展协议的原生网络层。
 * 音源请求与扫码登录全部经由这里（OkHttp + 系统级 CookieManager）发出：
 * - Cookie 由 WebView 的 CookieManager 统一管理，登录态即浏览器级体验；
 * - 重定向手动跟随，每一跳的 Set-Cookie 都写入 CookieManager 并回传给 WebView；
 * - 支持 binary 返回（base64），用于二维码 PNG 等二进制响应。
 */
@CapacitorPlugin(name = "FoliaBridge")
public class FoliaBridgePlugin extends Plugin {

    private final OkHttpClient client = new OkHttpClient.Builder()
            .connectTimeout(20, TimeUnit.SECONDS)
            .readTimeout(90, TimeUnit.SECONDS)
            .writeTimeout(90, TimeUnit.SECONDS)
            .followRedirects(false)
            .followSslRedirects(false)
            .build();

    @PluginMethod
    public void request(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("FoliaBridge.request requires url");
            return;
        }
        String method = call.getString("method", "GET");
        String body = call.getString("body");
        boolean binary = Boolean.TRUE.equals(call.getBoolean("binary"));
        int timeoutMs = call.getInt("timeoutMs", 60000);
        boolean followRedirects = !Boolean.FALSE.equals(call.getBoolean("followRedirects"));
        JSObject headers = call.getObject("headers");

        getBridge().execute(() -> {
            try {
                call.resolve(executeWithRedirects(url, method, body, headers, binary, timeoutMs, followRedirects));
            } catch (Exception e) {
                call.reject("FoliaBridge request failed: " + e.getMessage(), e);
            }
        });
    }

    private JSObject executeWithRedirects(String url, String method, String body, JSObject headerObject,
                                          boolean binary, int timeoutMs, boolean followRedirects) throws Exception {
        String currentUrl = url;
        String currentMethod = method;
        String currentBody = body;
        JSObject lastHeaders = new JSObject();
        java.util.List<String> setCookies = new java.util.ArrayList<>();

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);

        for (int hop = 0; hop < 8; hop++) {
            Map<String, String> headerMap = new HashMap<>();
            if (headerObject != null) {
                java.util.Iterator<String> keyIterator = headerObject.keys();
                while (keyIterator.hasNext()) {
                    String key = keyIterator.next();
                    Object value = headerObject.opt(key);
                    if (value != null) {
                        headerMap.put(key, String.valueOf(value));
                    }
                }
            }
            // 浏览器级 Cookie：没有显式 Cookie 头时自动附加 CookieManager 中该域的会话
            if (!headerMap.containsKey("Cookie") && !headerMap.containsKey("cookie")) {
                String cookies = cookieManager.getCookie(currentUrl);
                if (cookies != null && !cookies.isEmpty()) {
                    headerMap.put("Cookie", cookies);
                }
            }

            Request.Builder builder = new Request.Builder().url(currentUrl);
            for (Map.Entry<String, String> entry : headerMap.entrySet()) {
                builder.header(entry.getKey(), entry.getValue());
            }
            boolean hasBody = currentBody != null
                    && ("POST".equalsIgnoreCase(currentMethod) || "PUT".equalsIgnoreCase(currentMethod)
                    || "PATCH".equalsIgnoreCase(currentMethod) || "DELETE".equalsIgnoreCase(currentMethod));
            if (hasBody) {
                String contentType = headerMap.getOrDefault("Content-Type",
                        headerMap.getOrDefault("content-type", "application/x-www-form-urlencoded"));
                builder.method(currentMethod.toUpperCase(),
                        RequestBody.create(MediaType.parse(contentType), currentBody.getBytes("UTF-8")));
            } else {
                builder.method(currentMethod.toUpperCase(), null);
            }

            OkHttpClient scoped = client.newBuilder()
                    .callTimeout(timeoutMs, TimeUnit.MILLISECONDS)
                    .build();
            Response response = scoped.newCall(builder.build()).execute();
            try {
                // 记录并同步 Set-Cookie 到 CookieManager（跨跳保持会话）
                for (String setCookie : response.headers("Set-Cookie")) {
                    try {
                        cookieManager.setCookie(currentUrl, setCookie);
                    } catch (Exception ignored) {
                    }
                    setCookies.add(setCookie);
                }
                lastHeaders = new JSObject();
                for (Map.Entry<String, java.util.List<String>> entry : response.headers().toMultimap().entrySet()) {
                    String name = entry.getKey();
                    if ("set-cookie".equalsIgnoreCase(name) || entry.getValue().isEmpty()) continue;
                    lastHeaders.put(name, entry.getValue().get(0));
                }

                if (followRedirects && response.isRedirect()) {
                    String location = response.header("Location");
                    if (location != null) {
                        currentUrl = new java.net.URL(new java.net.URL(currentUrl), location).toString();
                        if ("POST".equalsIgnoreCase(currentMethod) && response.code() != 307 && response.code() != 308) {
                            currentMethod = "GET";
                            currentBody = null;
                        }
                        continue;
                    }
                }

                JSObject result = new JSObject();
                result.put("status", response.code());
                result.put("headers", lastHeaders);
                if (!setCookies.isEmpty()) {
                    JSArray arr = new JSArray();
                    for (String part : setCookies) arr.put(part);
                    result.put("setCookies", arr);
                }
                if (binary) {
                    InputStream in = response.body().byteStream();
                    ByteArrayOutputStream out = new ByteArrayOutputStream();
                    byte[] buffer = new byte[8192];
                    int read;
                    while ((read = in.read(buffer)) != -1) out.write(buffer, 0, read);
                    in.close();
                    result.put("bodyBase64", Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP));
                } else {
                    result.put("body", response.body() != null ? response.body().string() : "");
                }
                cookieManager.flush();
                return result;
            } finally {
                response.close();
            }
        }
        throw new Exception("too many redirects");
    }
}
