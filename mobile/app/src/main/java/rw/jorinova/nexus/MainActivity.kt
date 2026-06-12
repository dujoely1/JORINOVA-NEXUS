package rw.jorinova.nexus

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import rw.jorinova.nexus.net.ApiClient

/**
 * Minimal entry point: secure-store init + a login screen that authenticates
 * against the NEXUS backend and stores the JWT encrypted. After login it shows
 * a stub home — TODO: replace with the real navigation (camera, leave,
 * inventory, field report, notifications).
 */
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        ApiClient.init(applicationContext)
        setContent { MaterialTheme { AppRoot() } }
    }
}

@Composable
fun AppRoot() {
    var loggedIn by remember { mutableStateOf(ApiClient.token != null) }
    if (loggedIn) HomeStub() else LoginScreen(onSuccess = { loggedIn = true })
}

@Composable
fun LoginScreen(onSuccess: () -> Unit) {
    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("JORINOVA NEXUS", style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(24.dp))
        OutlinedTextField(username, { username = it }, label = { Text("Username") })
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(password, { password = it }, label = { Text("Password") })
        Spacer(Modifier.height(16.dp))
        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        Button(
            enabled = !busy && username.isNotBlank() && password.isNotBlank(),
            onClick = {
                busy = true; error = null
                scope.launch {
                    try {
                        val res = ApiClient.api.login(username.trim(), password)
                        ApiClient.token = res.access_token
                        onSuccess()
                    } catch (e: Exception) {
                        error = e.message ?: "Login failed"
                    } finally { busy = false }
                }
            },
        ) { Text(if (busy) "Signing in…" else "Sign in") }
    }
}

@Composable
fun HomeStub() {
    Column(Modifier.fillMaxSize().padding(24.dp)) {
        Text("Signed in ✓", style = MaterialTheme.typography.titleLarge)
        Spacer(Modifier.height(12.dp))
        Text("TODO: register device, then screens for camera capture, leave / " +
            "inventory requests, field reports (GPS), and notifications.")
    }
}
