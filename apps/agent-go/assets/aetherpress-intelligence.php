<?php
/**
 * Plugin Name: AetherPress Intelligence
 * Description: Imports explicitly approved SmartCrawler research as WordPress drafts for editorial review.
 * Version: 1.0.0
 * Author: AetherHost
 * License: GPL-2.0-or-later
 *
 * This is an AetherHost-managed must-use plugin. It deliberately has no
 * browser-visible credential, no automatic publishing path, and no free-form
 * crawling: the deployment must supply an allow-list of source origins.
 */

defined('ABSPATH') || exit;

const AETHERPRESS_INTELLIGENCE_OPTION = 'aetherpress_intelligence_jobs';

function aetherpress_intelligence_config() {
    $base = rtrim((string) getenv('AETHERPRESS_INTELLIGENCE_CRAWLER_URL'), '/');
    $token = (string) getenv('AETHERPRESS_INTELLIGENCE_CRAWLER_TOKEN');
    $sources = array_filter(array_map('trim', explode(',', (string) getenv('AETHERPRESS_INTELLIGENCE_ALLOWED_SOURCES'))));
    $hosts = array();
    foreach ($sources as $source) {
        $url = wp_parse_url($source);
        if (is_array($url) && ($url['scheme'] ?? '') === 'https' && !empty($url['host'])) {
            $hosts[] = strtolower($url['host']);
        }
    }
    return array('base' => $base, 'token' => $token, 'hosts' => array_values(array_unique($hosts)));
}

function aetherpress_intelligence_ready() {
    $config = aetherpress_intelligence_config();
    return str_starts_with($config['base'], 'https://') && strlen($config['token']) >= 16 && !empty($config['hosts']);
}

add_action('init', function () {
    register_post_type('aether_insight', array(
        'labels' => array('name' => 'Research insights', 'singular_name' => 'Research insight'),
        'public' => true,
        'show_ui' => true,
        'show_in_rest' => true,
        'has_archive' => false,
        'rewrite' => array('slug' => 'insights'),
        'supports' => array('title', 'editor', 'excerpt'),
        'menu_icon' => 'dashicons-lightbulb',
    ));
});

// Register custom post routes once after the managed plugin is installed or
// its rewrite structure changes. Avoid a costly rewrite flush on every page.
add_action('wp_loaded', function () {
    if (get_option('aetherpress_intelligence_rewrite_version') !== '1') {
        flush_rewrite_rules(false);
        update_option('aetherpress_intelligence_rewrite_version', '1', false);
    }
});

add_action('rest_api_init', function () {
    register_rest_route('aetherpress/v1', '/insights', array(
        'methods' => WP_REST_Server::READABLE,
        'permission_callback' => '__return_true',
        'callback' => function () {
            $posts = get_posts(array('post_type' => 'aether_insight', 'post_status' => 'publish', 'numberposts' => 6, 'orderby' => 'date', 'order' => 'DESC'));
            return array_map(function ($post) {
                return array(
                    'id' => $post->ID,
                    'title' => get_the_title($post),
                    'excerpt' => get_the_excerpt($post),
                    'content' => wp_strip_all_tags((string) $post->post_content, true),
                    'link' => get_permalink($post),
                    'date' => get_post_time('c', true, $post),
                    'sourceUrl' => esc_url_raw((string) get_post_meta($post->ID, '_aetherpress_source_url', true)),
                    'sourceTitle' => sanitize_text_field((string) get_post_meta($post->ID, '_aetherpress_source_title', true)),
                );
            }, $posts);
        },
    ));
});

add_action('admin_menu', function () {
    add_management_page('AetherPress Intelligence', 'AetherPress Intelligence', 'manage_options', 'aetherpress-intelligence', 'aetherpress_intelligence_render_page');
});

function aetherpress_intelligence_render_page() {
    if (!current_user_can('manage_options')) {
        wp_die('You do not have permission to manage research imports.');
    }
    $config = aetherpress_intelligence_config();
    $jobs = get_option(AETHERPRESS_INTELLIGENCE_OPTION, array());
    if (!is_array($jobs)) $jobs = array();
    ?>
    <div class="wrap">
      <h1>AetherPress Intelligence</h1>
      <p>Research sources are crawled with SmartCrawler and arrive as <strong>drafts</strong>. An editor must review and publish every insight.</p>
      <?php if (!aetherpress_intelligence_ready()): ?>
        <div class="notice notice-error"><p>This deployment is not configured for research imports. The crawler URL, scoped API key, and HTTPS source allow-list are required.</p></div>
      <?php else: ?>
        <p><strong>Approved source domains:</strong> <?php echo esc_html(implode(', ', $config['hosts'])); ?></p>
        <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
          <?php wp_nonce_field('aetherpress_intelligence_scrape'); ?>
          <input type="hidden" name="action" value="aetherpress_intelligence_scrape" />
          <label for="aetherpress-source-url">Approved article URL</label>
          <input id="aetherpress-source-url" name="source_url" type="url" class="regular-text" required placeholder="https://approved-source.example/article" />
          <?php submit_button('Request research import', 'primary', 'submit', false); ?>
        </form>
      <?php endif; ?>
      <h2>Research jobs</h2>
      <table class="widefat striped"><thead><tr><th>Source</th><th>Status</th><th>Requested</th><th>Action</th></tr></thead><tbody>
      <?php foreach ($jobs as $job): ?>
        <tr><td><a href="<?php echo esc_url($job['url']); ?>" target="_blank" rel="noreferrer"><?php echo esc_html($job['url']); ?></a></td><td><?php echo esc_html($job['status']); ?></td><td><?php echo esc_html($job['created_at']); ?></td><td>
          <?php if (($job['status'] ?? '') === 'completed' && empty($job['post_id'])): ?>
            <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>"><?php wp_nonce_field('aetherpress_intelligence_import_' . $job['id']); ?><input type="hidden" name="action" value="aetherpress_intelligence_import" /><input type="hidden" name="job_id" value="<?php echo esc_attr($job['id']); ?>" /><?php submit_button('Import as draft', 'secondary', 'submit', false); ?></form>
          <?php elseif (!empty($job['post_id'])): ?>
            <a href="<?php echo esc_url(get_edit_post_link((int) $job['post_id'])); ?>">Review draft</a>
          <?php else: ?>
            <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>"><?php wp_nonce_field('aetherpress_intelligence_refresh_' . $job['id']); ?><input type="hidden" name="action" value="aetherpress_intelligence_refresh" /><input type="hidden" name="job_id" value="<?php echo esc_attr($job['id']); ?>" /><?php submit_button('Refresh', 'secondary', 'submit', false); ?></form>
          <?php endif; ?>
        </td></tr>
      <?php endforeach; ?>
      <?php if (empty($jobs)): ?><tr><td colspan="4">No research jobs yet.</td></tr><?php endif; ?>
      </tbody></table>
    </div>
    <?php
}

function aetherpress_intelligence_redirect($message) {
    wp_safe_redirect(add_query_arg('aetherpress_notice', rawurlencode($message), admin_url('tools.php?page=aetherpress-intelligence')));
    exit;
}

function aetherpress_intelligence_allowed_url($raw) {
    $url = esc_url_raw((string) $raw);
    $parts = wp_parse_url($url);
    if (!$url || !is_array($parts) || ($parts['scheme'] ?? '') !== 'https' || empty($parts['host']) || !empty($parts['user']) || !empty($parts['pass'])) return false;
    return in_array(strtolower($parts['host']), aetherpress_intelligence_config()['hosts'], true) ? $url : false;
}

function aetherpress_intelligence_request($path, $method = 'GET', $body = null) {
    $config = aetherpress_intelligence_config();
    $args = array('method' => $method, 'timeout' => 20, 'redirection' => 0, 'sslverify' => true, 'headers' => array('Authorization' => 'Bearer ' . $config['token'], 'Accept' => 'application/json'));
    if ($body !== null) { $args['headers']['Content-Type'] = 'application/json'; $args['body'] = wp_json_encode($body); }
    return wp_safe_remote_request($config['base'] . $path, $args);
}

function aetherpress_intelligence_jobs() {
    $jobs = get_option(AETHERPRESS_INTELLIGENCE_OPTION, array());
    return is_array($jobs) ? $jobs : array();
}

function aetherpress_intelligence_save_jobs($jobs) {
    update_option(AETHERPRESS_INTELLIGENCE_OPTION, array_slice(array_values($jobs), 0, 30), false);
}

add_action('admin_post_aetherpress_intelligence_scrape', function () {
    if (!current_user_can('manage_options')) wp_die('Forbidden');
    check_admin_referer('aetherpress_intelligence_scrape');
    if (!aetherpress_intelligence_ready()) aetherpress_intelligence_redirect('Research imports are not configured.');
    $url = aetherpress_intelligence_allowed_url($_POST['source_url'] ?? '');
    if (!$url) aetherpress_intelligence_redirect('That URL is not an approved HTTPS source.');
    $response = aetherpress_intelligence_request('/v1/scrape', 'POST', array('url' => $url, 'formats' => array('markdown', 'metadata'), 'onlyMainContent' => true, 'js' => false, 'provider' => 'local', 'timeoutMs' => 15000, 'userAgent' => 'AetherPress-Editorial-Research/1.0'));
    if (is_wp_error($response) || wp_remote_retrieve_response_code($response) !== 200) aetherpress_intelligence_redirect('SmartCrawler could not accept this request.');
    $payload = json_decode(wp_remote_retrieve_body($response), true);
    if (!is_array($payload) || empty($payload['jobId'])) aetherpress_intelligence_redirect('SmartCrawler returned an invalid job response.');
    $jobs = aetherpress_intelligence_jobs();
    array_unshift($jobs, array('id' => sanitize_text_field($payload['jobId']), 'url' => $url, 'status' => 'pending', 'created_at' => current_time('mysql', true)));
    aetherpress_intelligence_save_jobs($jobs);
    aetherpress_intelligence_redirect('Research job created. Refresh its status before importing.');
});

function aetherpress_intelligence_find_job($id) {
    foreach (aetherpress_intelligence_jobs() as $index => $job) if (($job['id'] ?? '') === $id) return array($index, $job);
    return array(null, null);
}

add_action('admin_post_aetherpress_intelligence_refresh', function () {
    if (!current_user_can('manage_options')) wp_die('Forbidden');
    $id = sanitize_text_field($_POST['job_id'] ?? ''); check_admin_referer('aetherpress_intelligence_refresh_' . $id);
    [$index, $job] = aetherpress_intelligence_find_job($id); if ($index === null) aetherpress_intelligence_redirect('Research job not found.');
    $response = aetherpress_intelligence_request('/v1/jobs/' . rawurlencode($id));
    if (is_wp_error($response) || wp_remote_retrieve_response_code($response) !== 200) aetherpress_intelligence_redirect('Could not refresh this research job.');
    $payload = json_decode(wp_remote_retrieve_body($response), true); $jobs = aetherpress_intelligence_jobs();
    $jobs[$index]['status'] = sanitize_key($payload['status'] ?? 'unknown'); $jobs[$index]['error'] = sanitize_text_field($payload['error'] ?? '');
    aetherpress_intelligence_save_jobs($jobs); aetherpress_intelligence_redirect('Research job status refreshed.');
});

add_action('admin_post_aetherpress_intelligence_import', function () {
    if (!current_user_can('manage_options')) wp_die('Forbidden');
    $id = sanitize_text_field($_POST['job_id'] ?? ''); check_admin_referer('aetherpress_intelligence_import_' . $id);
    [$index, $job] = aetherpress_intelligence_find_job($id); if ($index === null || !empty($job['post_id'])) aetherpress_intelligence_redirect('Research job is not available for import.');
    $response = aetherpress_intelligence_request('/v1/jobs/' . rawurlencode($id));
    if (is_wp_error($response) || wp_remote_retrieve_response_code($response) !== 200) aetherpress_intelligence_redirect('Could not retrieve this research job.');
    $payload = json_decode(wp_remote_retrieve_body($response), true);
    if (!is_array($payload) || ($payload['status'] ?? '') !== 'completed' || empty($payload['data']['success'])) aetherpress_intelligence_redirect('This research job is not completed.');
    $data = $payload['data']; $metadata = is_array($data['metadata'] ?? null) ? $data['metadata'] : array();
    $title = sanitize_text_field($metadata['title'] ?? parse_url($job['url'], PHP_URL_HOST));
    $markdown = wp_strip_all_tags((string) ($data['markdown'] ?? ''));
    $postId = wp_insert_post(array('post_type' => 'aether_insight', 'post_status' => 'draft', 'post_title' => $title, 'post_content' => $markdown, 'post_excerpt' => wp_trim_words($markdown, 48)));
    if (is_wp_error($postId) || !$postId) aetherpress_intelligence_redirect('WordPress could not create the review draft.');
    update_post_meta($postId, '_aetherpress_source_url', esc_url_raw($metadata['finalUrl'] ?? $job['url']));
    update_post_meta($postId, '_aetherpress_source_title', $title);
    update_post_meta($postId, '_aetherpress_smartcrawl_job_id', $id);
    $jobs = aetherpress_intelligence_jobs(); $jobs[$index]['post_id'] = (int) $postId; $jobs[$index]['status'] = 'imported_draft';
    aetherpress_intelligence_save_jobs($jobs); aetherpress_intelligence_redirect('Research was imported as a draft. Review it before publishing.');
});

add_action('admin_notices', function () {
    if (!isset($_GET['aetherpress_notice'])) return;
    echo '<div class="notice notice-info is-dismissible"><p>' . esc_html(rawurldecode((string) $_GET['aetherpress_notice'])) . '</p></div>';
});
