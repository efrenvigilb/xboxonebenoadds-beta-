using Microsoft.Web.WebView2.Core;
using System;
using System.Globalization;
using System.Threading.Tasks;
using Windows.ApplicationModel;
using Windows.Gaming.Input;
using Windows.Storage;
using Windows.Storage.Pickers;
using Windows.System;
using Windows.UI.ViewManagement;
using Windows.UI.Xaml;
using Windows.UI.Xaml.Controls;
using Windows.UI.Xaml.Input;
using muxc = Microsoft.UI.Xaml.Controls;

namespace noadds
{
    public sealed partial class MainPage : Page
    {
        private const string HomeUrl = "https://m.youtube.com";
        private const string BundledExtensionRelativePath = "BundledExtensions\\AdblockForYouTube";
        private const double RightStickDeadZone = 0.2;
        private const double ScrollPixelsPerTick = 48;
        private const string YoutubeAdBlockScript = @"
(function () {
    if (window.__noAddsInstalled) {
        return 'already-installed';
    }

    window.__noAddsInstalled = true;

    const selectors = [
        '.video-ads',
        '.ytp-ad-module',
        '.ytp-ad-overlay-container',
        '.ytp-ad-overlay-slot',
        '.ytp-ad-survey',
        '.ytp-ce-element',
        '.ytp-paid-content-overlay',
        '.ytp-ad-image-overlay',
        '.ytp-suggested-action-badge',
        '.ytp-ad-player-overlay',
        'ytd-action-companion-ad-renderer',
        'ytd-companion-slot-renderer',
        'ytd-display-ad-renderer',
        'ytd-promoted-sparkles-web-renderer',
        'ytd-promoted-video-renderer',
        'ytd-player-legacy-desktop-watch-ads-renderer',
        'ytd-ad-slot-renderer',
        'ytm-promoted-sparkles-web-renderer',
        'ytm-companion-ad-renderer',
        'masthead-ad',
        '#player-ads',
        '#masthead-ad',
        '[layout=""display-ad-renderer""]',
        '[is-advertisement-renderer]',
        '.ad-showing'
    ];

    const css = document.createElement('style');
    css.id = 'noadds-style';
    css.textContent = [
        '.video-ads, .ytp-ad-module, .ytp-ad-overlay-container, .ytp-ad-overlay-slot, .ytp-ad-survey,',
        '.ytp-paid-content-overlay, .ytp-ad-image-overlay, .ytd-action-companion-ad-renderer,',
        'ytd-display-ad-renderer, ytd-promoted-sparkles-web-renderer, ytd-promoted-video-renderer,',
        'ytd-player-legacy-desktop-watch-ads-renderer, ytd-ad-slot-renderer, ytm-promoted-sparkles-web-renderer,',
        'ytm-companion-ad-renderer, masthead-ad, #player-ads, #masthead-ad { display: none !important; visibility: hidden !important; }'
    ].join(' ');
    document.documentElement.appendChild(css);

    function removeMatchingNodes() {
        selectors.forEach(function (selector) {
            try {
                document.querySelectorAll(selector).forEach(function (node) {
                    if (node.classList && node.classList.contains('html5-video-player')) {
                        node.classList.remove('ad-showing');
                        return;
                    }

                    node.remove();
                });
            } catch (e) {
            }
        });
    }

    function patchPlayerResponse() {
        try {
            const playerResponse = window.ytInitialPlayerResponse;
            if (playerResponse && playerResponse.adPlacements) {
                playerResponse.adPlacements = [];
            }

            if (playerResponse && playerResponse.playerAds) {
                playerResponse.playerAds = [];
            }
        } catch (e) {
        }
    }

    function patchJsonParsing() {
        if (window.__noAddsJsonPatched) {
            return;
        }

        window.__noAddsJsonPatched = true;
        const originalParse = JSON.parse;
        JSON.parse = function (text, reviver) {
            const parsed = originalParse(text, reviver);

            try {
                if (parsed && typeof parsed === 'object') {
                    if (Array.isArray(parsed.adPlacements)) {
                        parsed.adPlacements = [];
                    }

                    if (Array.isArray(parsed.playerAds)) {
                        parsed.playerAds = [];
                    }
                }
            } catch (e) {
            }

            return parsed;
        };
    }

    function skipButtons() {
        try {
            const buttons = Array.from(document.querySelectorAll(
                '.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button, button[aria-label*=""Skip""], button[aria-label*=""Saltar""]'
            ));

            buttons.forEach(function (button) {
                button.click();
            });
        } catch (e) {
        }
    }

    function forceEndVideoAds() {
        try {
            const player = document.querySelector('.html5-video-player');
            const video = document.querySelector('video');

            if (!player || !video) {
                return;
            }

            const adShowing = player.classList.contains('ad-showing')
                || !!document.querySelector('.ad-showing, .ytp-ad-player-overlay, .video-ads');

            if (!adShowing) {
                return;
            }

            player.classList.remove('ad-showing');
            video.muted = true;
            video.playbackRate = 16;

            if (Number.isFinite(video.duration) && video.duration > 0) {
                video.currentTime = Math.max(0, video.duration - 0.05);
            }

            video.play().catch(function () { });
        } catch (e) {
        }
    }

    function clean() {
        patchPlayerResponse();
        removeMatchingNodes();
        skipButtons();
        forceEndVideoAds();
    }

    patchJsonParsing();
    clean();
    window.setInterval(clean, 500);

    const observer = new MutationObserver(clean);
    observer.observe(document.documentElement || document.body, {
        childList: true,
        subtree: true,
        attributes: true
    });

    return 'installed';
})();";
        private const string ScrollScriptTemplate = @"
(function () {
    var dx = {0};
    var dy = {1};
    var target = document.scrollingElement || document.documentElement || document.body;
    if (target && typeof target.scrollBy === 'function') {
        target.scrollBy(dx, dy);
    } else {
        window.scrollBy(dx, dy);
    }
    return 'ok';
})();";

        private readonly DispatcherTimer gamepadTimer = new DispatcherTimer();
        private bool isFullscreen;
        private bool wasRightStickPressed;
        private bool isScrollDispatchRunning;
        private bool isWebViewReady;
        private double pendingScrollX;
        private double pendingScrollY;

        public MainPage()
        {
            InitializeComponent();
            BackButton.IsEnabled = false;
            ForwardButton.IsEnabled = false;
            StatusText.Text = "Inicializando navegador";

            Loaded += MainPage_Loaded;
            Unloaded += MainPage_Unloaded;

            gamepadTimer.Interval = TimeSpan.FromMilliseconds(33);
            gamepadTimer.Tick += GamepadTimer_Tick;
        }

        private async void MainPage_Loaded(object sender, RoutedEventArgs e)
        {
            gamepadTimer.Start();
            if (!isWebViewReady)
            {
                await InitializeBrowserAsync();
            }
        }

        private void MainPage_Unloaded(object sender, RoutedEventArgs e)
        {
            gamepadTimer.Stop();
        }

        private async Task InitializeBrowserAsync()
        {
            try
            {
                await BrowserView.EnsureCoreWebView2Async();

                BrowserView.CoreWebView2.Settings.IsStatusBarEnabled = false;
                BrowserView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = true;
                BrowserView.CoreWebView2.Settings.AreDevToolsEnabled = true;
                BrowserView.CoreWebView2.HistoryChanged += CoreWebView2_HistoryChanged;
                await BrowserView.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(YoutubeAdBlockScript);
                await TryInstallBundledExtensionAsync();

                isWebViewReady = true;
                StatusText.Text = "WebView2 listo";
                NavigateToAddress(HomeUrl);
            }
            catch (Exception ex)
            {
                StatusText.Text = $"No se pudo iniciar WebView2: {ex.Message}";
            }
        }

        private void CoreWebView2_HistoryChanged(CoreWebView2 sender, object args)
        {
            BackButton.IsEnabled = sender.CanGoBack;
            ForwardButton.IsEnabled = sender.CanGoForward;
        }

        private void GoButton_Click(object sender, RoutedEventArgs e)
        {
            NavigateToAddress(AddressBar.Text);
        }

        private void BackButton_Click(object sender, RoutedEventArgs e)
        {
            if (BrowserView.CoreWebView2?.CanGoBack == true)
            {
                BrowserView.CoreWebView2.GoBack();
            }
        }

        private void ForwardButton_Click(object sender, RoutedEventArgs e)
        {
            if (BrowserView.CoreWebView2?.CanGoForward == true)
            {
                BrowserView.CoreWebView2.GoForward();
            }
        }

        private void HomeButton_Click(object sender, RoutedEventArgs e)
        {
            NavigateToAddress(HomeUrl);
        }

        private void RefreshButton_Click(object sender, RoutedEventArgs e)
        {
            BrowserView.CoreWebView2?.Reload();
        }

        private async void ExtensionsButton_Click(object sender, RoutedEventArgs e)
        {
            if (BrowserView.CoreWebView2 is null)
            {
                StatusText.Text = "WebView2 aun no esta listo";
                return;
            }

            if (await TryInstallBundledExtensionAsync())
            {
                return;
            }

            FolderPicker picker = new FolderPicker();
            picker.FileTypeFilter.Add("*");

            StorageFolder folder = await picker.PickSingleFolderAsync();
            if (folder is null)
            {
                StatusText.Text = "Instalacion de extension cancelada";
                return;
            }

            try
            {
                CoreWebView2BrowserExtension extension =
                    await BrowserView.CoreWebView2.Profile.AddBrowserExtensionAsync(folder.Path);

                StatusText.Text = $"Extension instalada: {extension.Name}";
            }
            catch (Exception ex)
            {
                StatusText.Text = $"No se pudo instalar la extension: {ex.Message}";
            }
        }

        private async Task<bool> TryInstallBundledExtensionAsync()
        {
            if (BrowserView.CoreWebView2 is null)
            {
                return false;
            }

            string bundledExtensionPath = System.IO.Path.Combine(
                Package.Current.InstalledLocation.Path,
                BundledExtensionRelativePath);

            if (!System.IO.File.Exists(System.IO.Path.Combine(bundledExtensionPath, "manifest.json")))
            {
                return false;
            }

            try
            {
                CoreWebView2BrowserExtension extension =
                    await BrowserView.CoreWebView2.Profile.AddBrowserExtensionAsync(bundledExtensionPath);

                StatusText.Text = $"Extension activa: {extension.Name}";
                return true;
            }
            catch (Exception ex)
            {
                StatusText.Text = $"No se pudo activar la extension incluida: {ex.Message}";
                return false;
            }
        }

        private void AddressBar_KeyDown(object sender, KeyRoutedEventArgs e)
        {
            if (e.Key == VirtualKey.Enter)
            {
                NavigateToAddress(AddressBar.Text);
                e.Handled = true;
            }
        }

        private void BrowserView_NavigationStarting(muxc.WebView2 sender, CoreWebView2NavigationStartingEventArgs args)
        {
            AddressBar.Text = args.Uri ?? AddressBar.Text;
            StatusText.Text = IsYouTubeUri(args.Uri) ? "Cargando YouTube" : "Cargando pagina";
        }

        private async void BrowserView_NavigationCompleted(muxc.WebView2 sender, CoreWebView2NavigationCompletedEventArgs args)
        {
            BackButton.IsEnabled = BrowserView.CoreWebView2?.CanGoBack == true;
            ForwardButton.IsEnabled = BrowserView.CoreWebView2?.CanGoForward == true;

            if (args.IsSuccess)
            {
                AddressBar.Text = BrowserView.Source?.AbsoluteUri ?? AddressBar.Text;
                await TryEnableYouTubeAdBlockAsync(BrowserView.Source);
            }
            else
            {
                StatusText.Text = "No se pudo cargar la pagina";
            }
        }

        private async void GamepadTimer_Tick(object sender, object e)
        {
            Gamepad gamepad = Gamepad.Gamepads.Count > 0 ? Gamepad.Gamepads[0] : null;
            if (gamepad is null)
            {
                wasRightStickPressed = false;
                return;
            }

            GamepadReading reading = gamepad.GetCurrentReading();
            bool isRightStickPressed = reading.Buttons.HasFlag(GamepadButtons.RightThumbstick);

            if (isRightStickPressed && !wasRightStickPressed)
            {
                ToggleFullscreenMode();
            }

            wasRightStickPressed = isRightStickPressed;

            double scrollX = ApplyDeadZone(reading.RightThumbstickX) * ScrollPixelsPerTick;
            double scrollY = -ApplyDeadZone(reading.RightThumbstickY) * ScrollPixelsPerTick;

            if (Math.Abs(scrollX) < 0.5 && Math.Abs(scrollY) < 0.5)
            {
                return;
            }

            await QueueScrollAsync(scrollX, scrollY);
        }

        private void NavigateToAddress(string rawInput)
        {
            if (!isWebViewReady)
            {
                StatusText.Text = "Esperando a que WebView2 termine de iniciar";
                return;
            }

            string input = rawInput?.Trim() ?? string.Empty;
            if (string.IsNullOrWhiteSpace(input))
            {
                return;
            }

            if (!TryBuildUri(input, out Uri targetUri))
            {
                return;
            }

            targetUri = NormalizeYouTubeUri(targetUri);
            BrowserView.Source = targetUri;
            AddressBar.Text = targetUri.AbsoluteUri;
            StatusText.Text = IsYouTubeUri(targetUri) ? "Abriendo YouTube" : "Navegando";
        }

        private static bool TryBuildUri(string input, out Uri uri)
        {
            if (Uri.TryCreate(input, UriKind.Absolute, out uri))
            {
                return true;
            }

            if (Uri.TryCreate($"https://{input}", UriKind.Absolute, out uri))
            {
                return true;
            }

            string escapedQuery = Uri.EscapeDataString(input);
            return Uri.TryCreate($"https://m.youtube.com/results?search_query={escapedQuery}", UriKind.Absolute, out uri);
        }

        private async Task TryEnableYouTubeAdBlockAsync(Uri currentUri)
        {
            if (!IsYouTubeUri(currentUri))
            {
                StatusText.Text = isFullscreen ? "Modo inmersivo" : "Listo";
                return;
            }

            try
            {
                if (BrowserView.CoreWebView2 is not null)
                {
                    await BrowserView.CoreWebView2.ExecuteScriptAsync(YoutubeAdBlockScript);
                }

                StatusText.Text = isFullscreen ? "Modo inmersivo" : "Filtro de anuncios activo en YouTube";
            }
            catch
            {
                StatusText.Text = "YouTube abierto, sin poder inyectar filtro";
            }
        }

        private async Task QueueScrollAsync(double scrollX, double scrollY)
        {
            if (BrowserView.CoreWebView2 is null)
            {
                return;
            }

            pendingScrollX += scrollX;
            pendingScrollY += scrollY;

            if (isScrollDispatchRunning)
            {
                return;
            }

            isScrollDispatchRunning = true;

            try
            {
                while (Math.Abs(pendingScrollX) > 0.5 || Math.Abs(pendingScrollY) > 0.5)
                {
                    double currentX = pendingScrollX;
                    double currentY = pendingScrollY;
                    pendingScrollX = 0;
                    pendingScrollY = 0;

                    string script = string.Format(
                        CultureInfo.InvariantCulture,
                        ScrollScriptTemplate,
                        currentX,
                        currentY);

                    await BrowserView.CoreWebView2.ExecuteScriptAsync(script);
                }
            }
            catch
            {
            }
            finally
            {
                isScrollDispatchRunning = false;
            }
        }

        private void ToggleFullscreenMode()
        {
            ApplicationView view = ApplicationView.GetForCurrentView();
            isFullscreen = !isFullscreen;

            if (isFullscreen)
            {
                view.TryEnterFullScreenMode();
                TitleText.Visibility = Visibility.Collapsed;
                NavigationBar.Visibility = Visibility.Collapsed;
                StatusText.Visibility = Visibility.Collapsed;
                StatusText.Text = "Modo inmersivo";
                BrowserView.SetValue(Grid.RowProperty, 0);
                BrowserView.SetValue(Grid.RowSpanProperty, 4);
                BrowserView.Margin = new Thickness(0);
                RootLayout.Padding = new Thickness(0);
                RootLayout.RowSpacing = 0;
            }
            else
            {
                view.ExitFullScreenMode();
                TitleText.Visibility = Visibility.Visible;
                NavigationBar.Visibility = Visibility.Visible;
                StatusText.Visibility = Visibility.Visible;
                StatusText.Text = IsYouTubeUri(BrowserView.Source) ? "Filtro de anuncios activo en YouTube" : "Listo";
                BrowserView.SetValue(Grid.RowProperty, 3);
                BrowserView.SetValue(Grid.RowSpanProperty, 1);
                BrowserView.Margin = new Thickness(0, 8, 0, 0);
                RootLayout.Padding = new Thickness(12);
                RootLayout.RowSpacing = 12;
            }
        }

        private static double ApplyDeadZone(double value)
        {
            return Math.Abs(value) < RightStickDeadZone ? 0 : value;
        }

        private static bool IsYouTubeUri(Uri uri)
        {
            string host = uri.Host;
            if (string.IsNullOrWhiteSpace(host))
            {
                return false;
            }

            return host.Contains("youtube.com", StringComparison.OrdinalIgnoreCase)
                || host.Contains("youtu.be", StringComparison.OrdinalIgnoreCase);
        }

        private static bool IsYouTubeUri(string rawUri)
        {
            if (string.IsNullOrWhiteSpace(rawUri) || !Uri.TryCreate(rawUri, UriKind.Absolute, out Uri uri))
            {
                return false;
            }

            return IsYouTubeUri(uri);
        }

        private static Uri NormalizeYouTubeUri(Uri uri)
        {
            if (!IsYouTubeUri(uri))
            {
                return uri;
            }

            if (uri.Host.Equals("youtu.be", StringComparison.OrdinalIgnoreCase))
            {
                string videoId = uri.AbsolutePath.Trim('/');
                if (!string.IsNullOrWhiteSpace(videoId)
                    && Uri.TryCreate($"https://m.youtube.com/watch?v={Uri.EscapeDataString(videoId)}", UriKind.Absolute, out Uri shortUri))
                {
                    return shortUri;
                }

                return uri;
            }

            UriBuilder builder = new UriBuilder(uri)
            {
                Host = "m.youtube.com"
            };

            return builder.Uri;
        }
    }
}
