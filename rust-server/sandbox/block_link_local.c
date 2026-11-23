#define _GNU_SOURCE

#include <arpa/inet.h>
#include <errno.h>
#include <netinet/in.h>
#include <stdint.h>
#include <sys/socket.h>
#include <sys/syscall.h>
#include <unistd.h>

/*
 * Refuse connections to the EC2 instance-metadata service (169.254.169.254)
 * and the ECS task-role credential endpoint (169.254.170.2).
 *
 * User programs are compiled in this container. A build script or
 * include_str!-driven helper that can open those addresses can read task
 * credentials. The task definition also leaves the task role empty; this
 * library is the sandbox backstop if one is attached again.
 *
 * Loaded via LD_PRELOAD for the compile process. Only connect(2) to those
 * two IPv4 addresses is affected.
 */

static int is_metadata_address(const struct sockaddr *addr) {
    if (addr == 0 || addr->sa_family != AF_INET) {
        return 0;
    }
    const struct sockaddr_in *in = (const struct sockaddr_in *)addr;
    uint32_t ip = ntohl(in->sin_addr.s_addr);
    return ip == 0xA9FEA9FEu || ip == 0xA9FEAA02u;
}

static int blocked_connect(int sockfd, const struct sockaddr *addr, socklen_t addrlen) {
    if (is_metadata_address(addr)) {
        errno = EPERM;
        return -1;
    }
    /* Call the kernel directly. Looking up libc's connect with dlsym loops
     * back into this interpose on macOS, and would also loop under LD_PRELOAD
     * if the lookup failed open. */
#if defined(__APPLE__)
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
#endif
    return (int)syscall(SYS_connect, sockfd, addr, addrlen);
#if defined(__APPLE__)
#pragma clang diagnostic pop
#endif
}

#if defined(__APPLE__)
/* dyld does not interpose a flat `connect` symbol the way ld.so does.
 * The __interpose section is what DYLD_INSERT_LIBRARIES honors. */
__attribute__((used)) static struct {
    const void *replacement;
    const void *replacee;
} _interpose_connect __attribute__((section("__DATA,__interpose"))) = {
    (const void *)blocked_connect,
    (const void *)connect,
};
#else
int connect(int sockfd, const struct sockaddr *addr, socklen_t addrlen) {
    return blocked_connect(sockfd, addr, addrlen);
}
#endif
